// Devices run kernels and report time, metrics and a correctness check against the Loop IR
// reference at sampled outputs. Three kinds:
//   sim:<gpu>  the SIMT simulator plus a timing model on a GPU's specs (always available)
//   webgpu     your own GPU through WebGPU (real timings; timestamp queries when available)
//   cuda       a CUDA box running runner/kiln_runner.py (live when the page is served by the
//              runner; otherwise export a bundle, run it there, import the results)
import { SPECS, WEBGPU_DEFAULT, target } from "./targets.js";
import { simulateKernel, kernelInputs, referenceAt, sampleIndices, checkValues, seedOf } from "./program.js";
import { numel, median } from "../core/util.js";

export class SimDevice {
  constructor(spec) { this.spec = spec; this.id = "sim:" + spec.id; this.kind = "sim"; this.name = spec.name; this.label = `${spec.name} · simulated`; this.target = target(spec); this.status = "ready"; }
  async probe() { return true; }
  describe() { const s = this.spec; return { kind: "simulated GPU", arch: s.arch, SMs: s.sms, clock: s.clockGHz + " GHz", "FP32 peak": s.peakTflops + " TFLOP/s", bandwidth: s.bwGBs + " GB/s", L2: s.l2MB + " MB", "smem/block": (s.smemPerBlock / 1024).toFixed(0) + " KiB", "threads/block": s.maxThreadsPerBlock, note: "kernels execute in a lockstep SIMT simulator on sampled blocks; time comes from a roofline + occupancy model with these specs" }; }
  async runKernel(kern, opts = {}) {
    const r = simulateKernel(kern, this.target, opts);
    return { us: r.metrics.us, samples: [r.metrics.us], metrics: r.metrics, check: r.check, wallMs: r.simMs };
  }
}

export class WebGpuDevice {
  constructor() { this.id = "webgpu"; this.kind = "webgpu"; this.name = "WebGPU"; this.label = "WebGPU · this browser"; this.status = "not probed"; this.target = target(WEBGPU_DEFAULT); this.cache = new Map(); }
  async probe() {
    if (this.device) return true;
    if (typeof navigator === "undefined" || !navigator.gpu) { this.status = "unavailable: this browser has no WebGPU"; return false; }
    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
      if (!adapter) { this.status = "unavailable: no adapter"; return false; }
      const L = adapter.limits;
      this.timestamps = adapter.features.has("timestamp-query");
      this.device = await adapter.requestDevice({
        requiredFeatures: this.timestamps ? ["timestamp-query"] : [],
        requiredLimits: {
          maxComputeInvocationsPerWorkgroup: L.maxComputeInvocationsPerWorkgroup, maxComputeWorkgroupSizeX: L.maxComputeWorkgroupSizeX,
          maxComputeWorkgroupStorageSize: L.maxComputeWorkgroupStorageSize, maxStorageBufferBindingSize: L.maxStorageBufferBindingSize,
          maxBufferSize: L.maxBufferSize, maxStorageBuffersPerShaderStage: L.maxStorageBuffersPerShaderStage,
        },
      });
      const info = adapter.info || (await adapter.requestAdapterInfo?.()) || {};
      this.info = { vendor: info.vendor || "?", architecture: info.architecture || "?", description: info.description || "", timestamps: this.timestamps };
      this.name = `WebGPU ${[info.vendor, info.architecture].filter(Boolean).join(" ")}`.trim();
      this.label = this.name;
      this.target = target({ ...WEBGPU_DEFAULT, name: this.name, maxThreadsPerBlock: Math.min(1024, L.maxComputeInvocationsPerWorkgroup, L.maxComputeWorkgroupSizeX), smemPerBlock: L.maxComputeWorkgroupStorageSize, smemPerSM: L.maxComputeWorkgroupStorageSize * 2 });
      this.status = "ready";
      this.device.lost.then((e) => { this.status = "lost: " + (e?.message || ""); this.device = null; });
      return true;
    } catch (e) { this.status = "unavailable: " + e.message; return false; }
  }
  describe() { return { kind: "your GPU via WebGPU", ...(this.info || {}), status: this.status, "threads/block": this.target.maxThreadsPerBlock, "smem/block": this.target.smemPerBlock + " B", note: "real execution; timing from timestamp queries when the adapter allows them, else from queue completion" }; }
  async pipelineFor(kern) {
    let p = this.cache.get(kern.wgsl);
    if (p) return p;
    const dev = this.device;
    const module = dev.createShaderModule({ code: kern.wgsl });
    const info = await module.getCompilationInfo?.();
    const errs = (info?.messages || []).filter((m) => m.type === "error");
    if (errs.length) throw new Error(`WGSL: ${errs[0].message} (line ${errs[0].lineNum})`);
    dev.pushErrorScope("validation");
    p = dev.createComputePipeline({ layout: "auto", compute: { module, entryPoint: "main" } });
    const err = await dev.popErrorScope();
    if (err) throw new Error("pipeline: " + err.message);
    this.cache.set(kern.wgsl, p);
    return p;
  }
  async runKernel(kern, { seed = 1, reps = 20, warmup = 3 } = {}) {
    if (!(await this.probe())) throw new Error(this.status);
    const dev = this.device, K = kern.K;
    const pipe = await this.pipelineFor(kern);
    const ins = kernelInputs(kern, seed);
    const mk = (data, usage) => { const b = dev.createBuffer({ size: Math.max(4, data.byteLength), usage, mappedAtCreation: true }); new Float32Array(b.getMappedRange()).set(data); b.unmap(); return b; };
    const bufs = ins.map((d) => mk(d, GPUBufferUsage.STORAGE));
    const outN = numel(kern.shape);
    const out = dev.createBuffer({ size: outN * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    const bind = dev.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [...bufs, out].map((buffer, binding) => ({ binding, resource: { buffer } })) });
    const gx = Math.min(K.grid, 65535), gy = Math.ceil(K.grid / 65535);
    const qs = this.timestamps ? dev.createQuerySet({ type: "timestamp", count: 2 * reps }) : null;
    const resolve = qs ? dev.createBuffer({ size: 16 * reps, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC }) : null;
    const read = qs ? dev.createBuffer({ size: 16 * reps, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }) : null;
    const encodeRuns = (n, timed) => {
      const enc = dev.createCommandEncoder();
      for (let i = 0; i < n; i++) {
        const pass = enc.beginComputePass(timed && qs ? { timestampWrites: { querySet: qs, beginningOfPassWriteIndex: 2 * i, endOfPassWriteIndex: 2 * i + 1 } } : undefined);
        pass.setPipeline(pipe); pass.setBindGroup(0, bind); pass.dispatchWorkgroups(gx, gy); pass.end();
      }
      if (timed && qs) { enc.resolveQuerySet(qs, 0, 2 * n, resolve, 0); enc.copyBufferToBuffer(resolve, 0, read, 0, 16 * n); }
      return enc.finish();
    };
    dev.queue.submit([encodeRuns(warmup, false)]);
    await dev.queue.onSubmittedWorkDone();
    let samples;
    if (qs) {
      dev.queue.submit([encodeRuns(reps, true)]);
      await read.mapAsync(GPUMapMode.READ);
      const t = new BigUint64Array(read.getMappedRange().slice(0));
      read.unmap();
      samples = Array.from({ length: reps }, (_, i) => Number(t[2 * i + 1] - t[2 * i]) / 1000);
    } else {
      samples = [];
      for (let i = 0; i < reps; i++) { const t0 = performance.now(); dev.queue.submit([encodeRuns(1, false)]); await dev.queue.onSubmittedWorkDone(); samples.push((performance.now() - t0) * 1000); }
    }
    // read back sampled outputs and check them
    const idx = sampleIndices(outN, 384);
    const stage = dev.createBuffer({ size: outN * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = dev.createCommandEncoder(); enc.copyBufferToBuffer(out, 0, stage, 0, outN * 4); dev.queue.submit([enc.finish()]);
    await stage.mapAsync(GPUMapMode.READ);
    const all = new Float32Array(stage.getMappedRange().slice(0));
    stage.unmap();
    const got = Float32Array.from(idx, (i) => all[i]);
    const check = checkValues(got, referenceAt(kern, ins, idx));
    check.n = idx.length;
    for (const b of [...bufs, out, stage, resolve, read]) b?.destroy();
    qs?.destroy();
    const us = median(samples);
    const bytes = kern.bytes;
    return { us, samples, metrics: { us, kind: qs ? "timestamp" : "wall clock", gbs: bytes / us / 1e3, min: Math.min(...samples), threads: K.block, blocks: K.grid, smem: K.smemBytes }, check };
  }
}

// a CUDA box running runner/kiln_runner.py; live only when this page is served by that runner
export class CudaDevice {
  constructor(base = null) { this.id = "cuda"; this.kind = "cuda"; this.name = "CUDA runner"; this.label = "CUDA · runner"; this.base = base; this.status = "not connected"; this.target = target(SPECS.rtx5090); this.info = null; }
  async probe() {
    const base = this.base ?? (typeof location !== "undefined" && /^https?:/.test(location.protocol) ? location.origin : null);
    if (!base) { this.status = "not connected: open the workbench from the runner (python kiln_runner.py serve) or use bundles"; return false; }
    try {
      const r = await fetch(base + "/api/device", { cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      this.info = await r.json();
      this.base = base;
      this.name = `CUDA ${this.info.name || ""}`.trim();
      this.label = this.name;
      const spec = Object.values(SPECS).find((s) => this.info.cc && String(s.sm) === String(this.info.cc).replace(".", "")) || SPECS.rtx5090;
      this.target = target({ ...spec, name: this.name, sms: this.info.sms || spec.sms, smemPerBlock: this.info.smemPerBlock || spec.smemPerBlock });
      this.status = "ready";
      return true;
    } catch (e) { this.status = "not connected: " + (e.message || e); return false; }
  }
  describe() { return { kind: "CUDA through kiln_runner.py", ...(this.info || {}), status: this.status, note: "nvcc compiles each kernel; CUDA events time it; optional Nsight Compute metrics" }; }
  async runKernels(kernels, opts = {}) {
    if (!(await this.probe())) throw new Error(this.status);
    const body = bundle(kernels, opts);
    const r = await fetch(this.base + "/api/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`runner: HTTP ${r.status} ${await r.text()}`);
    return ingest(await r.json(), kernels, opts);
  }
  async runKernel(kern, opts) { return (await this.runKernels([kern], opts))[0]; }
}

// the runner protocol, shared by live runs and offline bundles
export function bundle(kernels, { seed = 1, reps = 50, warmup = 5, ncu = false } = {}) {
  return {
    format: "kiln-bundle/1", reps, warmup, ncu, created: new Date().toISOString(),
    kernels: kernels.map((kn) => ({
      name: kn.name, identity: kn.identity, row: kn.row, source: kn.cuda, grid: kn.K.grid, block: kn.K.block, smem: kn.K.smemBytes,
      inputs: kn.inShapes.map((s, j) => ({ size: numel(s), seed: seedOf(kn, seed, j) })), out: numel(kn.shape), samples: sampleIndices(numel(kn.shape), 384),
    })),
  };
}
export function ingest(res, kernels, { seed = 1 } = {}) {
  return kernels.map((kn) => {
    const r = (res.kernels || []).find((x) => x.name === kn.name && (!x.identity || x.identity === kn.identity));
    if (!r) return { error: `no result for ${kn.name}` };
    if (r.error) return { error: r.error };
    const ins = kernelInputs(kn, seed);
    const idx = sampleIndices(numel(kn.shape), 384);
    const check = checkValues(Float32Array.from(r.samples || []), referenceAt(kn, ins, idx));
    check.n = idx.length;
    const us = r.us_median;
    return { us, samples: r.us_all || [us], check, metrics: { us, kind: "CUDA events", min: r.us_min, gbs: kn.bytes / us / 1e3, ...(r.ncu || {}), threads: kn.K.block, blocks: kn.K.grid, smem: kn.K.smemBytes, regs: r.regs ?? null }, device: res.device };
  });
}

export function makeDevices() {
  return [...Object.values(SPECS).map((s) => new SimDevice(s)), new WebGpuDevice(), new CudaDevice()];
}
