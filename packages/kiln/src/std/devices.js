// Devices run kernels and report time, metrics and a correctness check against the Loop IR
// reference at sampled outputs. Three kinds:
//   sim:<gpu>  the SIMT simulator plus a timing model on a GPU's specs (always available)
//   webgpu     your own GPU through WebGPU (real timings; timestamp queries when available)
//   cuda       a CUDA box running runner/kiln_runner.py (live when the page is served by the
//              runner; otherwise export a bundle, run it there, import the results)
import { SPECS, WEBGPU_DEFAULT, target } from "./targets.js";
import { simulateKernel, kernelInputs, referenceAt, sampleIndices, seedOf } from "./program.js";
import { numel, median } from "../core/util.js";
import { checkSamples, deviceId, repetitionOrder } from "@kiln/evidence";
import { INPUT_SEED, specHash } from "./records.js";

// Every device has two ids: `id`, the stable key the UI and presets select it by ("sim:rtx5090", "webgpu", "cuda"),
// and `evidenceId`, the fingerprinted id its records carry (guide §23), known once the device is probed.
// runKernel returns one repetition: { us, samples: [one per repetition], raw?, kind, reps, launches?, warmup?,
// metrics, check }.

export class SimDevice {
  constructor(spec) {
    this.spec = spec; this.id = "sim:" + spec.id; this.kind = "sim"; this.name = spec.name; this.label = `${spec.name} · simulated`; this.target = target(spec); this.status = "ready";
    this.fingerprint = { spec: specHash(spec), name: spec.name };
    this.evidenceId = deviceId("sim", spec.id, this.fingerprint);
  }
  async probe() { return true; }
  describe() { const s = this.spec; return { kind: "simulated GPU", arch: s.arch, SMs: s.sms, clock: s.clockGHz + " GHz", "FP32 peak": s.peakTflops + " TFLOP/s", bandwidth: s.bwGBs + " GB/s", L2: s.l2MB + " MB", "smem/block": (s.smemPerBlock / 1024).toFixed(0) + " KiB", "threads/block": s.maxThreadsPerBlock, note: "kernels execute in a lockstep SIMT simulator on sampled blocks; time comes from a roofline + occupancy model with these specs" }; }
  async runKernel(kern, opts = {}) {
    const r = simulateKernel(kern, this.target, opts);
    return { us: r.metrics.us, samples: [r.metrics.us], kind: "simulated", reps: 1, metrics: r.metrics, check: r.check, wallMs: r.simMs };
  }
}

// ----------------------------------------------------------------------------- the measurement protocol
// Guide §28. A repetition runs every kernel once, in an order shuffled by the protocol seed, each kernel in a fresh
// context; the repetition's sample of a kernel is the median of that kernel's timed launches. Repetitions, not
// launches, are what the statistics resample (§25): launches inside one context share its allocations, its compiled
// pipeline and whatever the driver cached for them, so they are not independent observations.

// the seeded order of kernels within a repetition, shared with the server's CUDA jobs
export { repetitionOrder };

/**
 * The protocol's bookkeeping around `runOne(kern, { rep, position, check })`, which runs one kernel once in a fresh
 * context and returns `{ times, check?, metrics? }` (its timed launches, in µs). Returns one result per kernel,
 * aligned with `kernels`:
 *   { us, samples, raw, position, kind, reps, launches, warmup, seed, check, metrics, repErrors?, error? }
 * where `samples[s]` is the median of `raw[s]` and `position[s]` is the kernel's place in that repetition's order.
 * A repetition that throws is kept (`repErrors`), never dropped: the kernel then has fewer samples than `reps`, which
 * makes its record invalid. The output check runs in the first repetition in which the kernel completes.
 */
export async function runProtocol(kernels, { reps, warmup, launches, seed }, runOne, { kind, onStep } = {}) {
  const acc = kernels.map(() => ({ samples: [], raw: [], position: [], errors: [], check: null, metrics: null }));
  const total = reps * kernels.length;
  let done = 0;
  for (let rep = 0; rep < reps; rep++) {
    const order = repetitionOrder(kernels.length, seed, rep);
    for (let position = 0; position < order.length; position++) {
      const i = order[position], a = acc[i];
      try {
        const r = await runOne(kernels[i], { rep, position, check: !a.check });
        const times = (r?.times || []).filter((t) => Number.isFinite(t) && t >= 0);
        if (!times.length) throw new Error("no timed launch completed");
        a.samples.push(median(times)); a.raw.push(times); a.position.push(position);
        if (r.check && !a.check) a.check = r.check;
        if (r.metrics) a.metrics = r.metrics;
      } catch (e) { a.errors.push(`repetition ${rep}: ${e?.message || e}`); }
      onStep?.(++done, total);
    }
  }
  return acc.map((a) => {
    const base = { kind, reps, launches, warmup, seed };
    if (!a.samples.length) return { ...base, us: Infinity, samples: [], error: a.errors.length ? `all ${reps} repetitions failed; ${a.errors[0]}` : "no repetition ran" };
    const us = median(a.samples);
    const all = a.raw.flat();
    return { ...base, us, samples: a.samples, raw: a.raw, position: a.position, check: a.check, metrics: { ...a.metrics, us, min: Math.min(...all), reps: a.samples.length }, ...(a.errors.length ? { repErrors: a.errors } : {}) };
  });
}

/**
 * The step of the grid a protocol run's launch times (µs) sit on: the smallest gap between distinct values when
 * every value is a whole multiple of it, Infinity when every launch read 0, else null (no grid, or too few values
 * to tell). Chrome without --enable-unsafe-webgpu coarsens timestamp queries (to 65.536 µs in Chrome 155 on macOS),
 * which cannot time a kernel of tens of µs; with the flag the step is the GPU timer's (~0.04 µs on Apple GPUs).
 */
export function timerQuantum(times) {
  const vals = [...new Set(times.filter((t) => Number.isFinite(t) && t >= 0))].sort((a, b) => a - b);
  if (vals.length < 2) return vals.length === 1 && vals[0] === 0 ? Infinity : null;
  let q = Infinity;
  for (let i = 1; i < vals.length; i++) q = Math.min(q, vals[i] - vals[i - 1]);
  return vals.every((v) => Math.abs(v / q - Math.round(v / q)) < 1e-3) ? q : null;
}

/** `p`, or a rejection with `message` once `ms` pass first (the work itself is not cancelled; the caller cleans up). */
export function deadline(p, ms, message) {
  let t;
  return Promise.race([p, new Promise((_, reject) => { t = setTimeout(() => reject(new Error(message)), ms); })]).finally(() => clearTimeout(t));
}

/** How long one kernel may hold one fresh context (device, compile, launches, check) before its repetition fails. */
export const CONTEXT_TIMEOUT_MS = 60000;

const limitsOf = (adapter) => {
  const L = adapter.limits;
  return {
    maxComputeInvocationsPerWorkgroup: L.maxComputeInvocationsPerWorkgroup, maxComputeWorkgroupSizeX: L.maxComputeWorkgroupSizeX,
    maxComputeWorkgroupStorageSize: L.maxComputeWorkgroupStorageSize, maxStorageBufferBindingSize: L.maxStorageBufferBindingSize,
    maxBufferSize: L.maxBufferSize, maxStorageBuffersPerShaderStage: L.maxStorageBuffersPerShaderStage,
  };
};

async function compilePipeline(dev, kern) {
  const module = dev.createShaderModule({ code: kern.wgsl });
  const info = await module.getCompilationInfo?.();
  const errs = (info?.messages || []).filter((m) => m.type === "error");
  if (errs.length) throw new Error(`WGSL: ${errs[0].message} (line ${errs[0].lineNum})`);
  try { return await dev.createComputePipelineAsync({ layout: "auto", compute: { module, entryPoint: "main" } }); }
  catch (e) { throw new Error("pipeline: " + (e?.message || e)); }
}

/**
 * One kernel, once, on `dev` with compiled `pipe`: `warmup` untimed launches, then `launches` timed ones (timestamp
 * queries when `timestamps`, else wall clock around submit and completion), and, when `check`, the sampled outputs
 * compared with the Loop IR reference. `ins` are the kernel's inputs when the caller already made them. Returns
 * `{ times, check?, metrics }`; every buffer it made is destroyed.
 */
async function runOnce(dev, pipe, kern, { warmup, launches, timestamps, check, ins = kernelInputs(kern, INPUT_SEED) }) {
  const K = kern.K;
  const made = [];
  const buf = (desc) => { const b = dev.createBuffer(desc); made.push(b); return b; };
  let qs = null, popped = false;
  dev.pushErrorScope("out-of-memory");
  dev.pushErrorScope("validation");
  try {
    const bufs = ins.map((d) => { const b = buf({ size: Math.max(4, d.byteLength), usage: GPUBufferUsage.STORAGE, mappedAtCreation: true }); new Float32Array(b.getMappedRange()).set(d); b.unmap(); return b; });
    const outN = numel(kern.shape);
    const out = buf({ size: Math.max(4, outN * 4), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    const bind = dev.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [...bufs, out].map((buffer, binding) => ({ binding, resource: { buffer } })) });
    const gx = Math.min(K.grid, 65535), gy = Math.ceil(K.grid / 65535);
    qs = timestamps ? dev.createQuerySet({ type: "timestamp", count: 2 * launches }) : null;
    const resolve = qs ? buf({ size: 16 * launches, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC }) : null;
    const read = qs ? buf({ size: 16 * launches, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }) : null;
    const encode = (n, timed) => {
      const enc = dev.createCommandEncoder();
      for (let i = 0; i < n; i++) {
        const pass = enc.beginComputePass(timed && qs ? { timestampWrites: { querySet: qs, beginningOfPassWriteIndex: 2 * i, endOfPassWriteIndex: 2 * i + 1 } } : undefined);
        pass.setPipeline(pipe); pass.setBindGroup(0, bind); pass.dispatchWorkgroups(gx, gy); pass.end();
      }
      if (timed && qs) { enc.resolveQuerySet(qs, 0, 2 * n, resolve, 0); enc.copyBufferToBuffer(resolve, 0, read, 0, 16 * n); }
      return enc.finish();
    };
    if (warmup > 0) { dev.queue.submit([encode(warmup, false)]); await dev.queue.onSubmittedWorkDone(); }
    let times;
    if (qs) {
      dev.queue.submit([encode(launches, true)]);
      await read.mapAsync(GPUMapMode.READ);
      const t = new BigUint64Array(read.getMappedRange().slice(0));
      read.unmap();
      times = Array.from({ length: launches }, (_, i) => Number(t[2 * i + 1] - t[2 * i]) / 1000);
    } else {
      times = [];
      for (let i = 0; i < launches; i++) { const t0 = performance.now(); dev.queue.submit([encode(1, false)]); await dev.queue.onSubmittedWorkDone(); times.push((performance.now() - t0) * 1000); }
    }
    let ck = null;
    if (check) {
      const idx = sampleIndices(outN, 384);
      const stage = buf({ size: Math.max(4, outN * 4), usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      const enc = dev.createCommandEncoder(); enc.copyBufferToBuffer(out, 0, stage, 0, outN * 4); dev.queue.submit([enc.finish()]);
      await stage.mapAsync(GPUMapMode.READ);
      const all = new Float32Array(stage.getMappedRange().slice(0));
      stage.unmap();
      ck = checkSamples(Float32Array.from(idx, (i) => all[i]), referenceAt(kern, ins, idx));
      ck.n = idx.length;
    }
    const verr = await dev.popErrorScope(), merr = await dev.popErrorScope();
    popped = true;
    if (verr || merr) throw new Error(`${verr ? "validation" : "out of memory"}: ${(verr || merr).message}`);
    const us = median(times);
    return { times, check: ck, metrics: { us, kind: qs ? "timestamp" : "wall clock", gbs: kern.bytes / us / 1e3, min: Math.min(...times), threads: K.block, blocks: K.grid, smem: K.smemBytes } };
  } catch (e) {
    // the error scopes usually hold the cause (a limit, a binding); pop them so a reused device does not keep them
    if (!popped) {
      popped = true;
      const v = await dev.popErrorScope().catch(() => null), m = await dev.popErrorScope().catch(() => null);
      if (v || m) throw new Error(`${v ? "validation" : "out of memory"}: ${(v || m).message} (${e?.message || e})`);
    }
    throw e;
  } finally {
    for (const b of made) b.destroy();
    qs?.destroy();
  }
}

export class WebGpuDevice {
  constructor() {
    this.id = "webgpu"; this.kind = "webgpu"; this.name = "WebGPU"; this.label = "WebGPU · this browser"; this.status = "not probed"; this.target = target(WEBGPU_DEFAULT); this.cache = new Map(); this.fingerprint = null; this.evidenceId = null;
    // the measurement protocol (§28); the Devices view edits these
    this.protocol = { reps: 7, warmup: 3, launches: 20, seed: 1 };
  }
  async probe() {
    if (this.device) return true;
    if (typeof navigator === "undefined" || !navigator.gpu) { this.status = "unavailable: this browser has no WebGPU"; return false; }
    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
      if (!adapter) { this.status = "unavailable: no adapter"; return false; }
      const L = adapter.limits;
      this.timestamps = adapter.features.has("timestamp-query");
      this.device = await adapter.requestDevice({ requiredFeatures: this.timestamps ? ["timestamp-query"] : [], requiredLimits: limitsOf(adapter) });
      const info = adapter.info || (await adapter.requestAdapterInfo?.()) || {};
      this.info = { vendor: info.vendor || "?", architecture: info.architecture || "?", description: info.description || "", timestamps: this.timestamps };
      this.fingerprint = { vendor: info.vendor || "", architecture: info.architecture || "", device: info.device || "", description: info.description || "", timestamps: !!this.timestamps, userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "" };
      this.name = `WebGPU ${[info.vendor, info.architecture].filter(Boolean).join(" ")}`.trim();
      this.label = this.name;
      this.evidenceId = deviceId("webgpu", this.name, this.fingerprint);
      this.target = target({ ...WEBGPU_DEFAULT, name: this.name, maxThreadsPerBlock: Math.min(1024, L.maxComputeInvocationsPerWorkgroup, L.maxComputeWorkgroupSizeX), smemPerBlock: L.maxComputeWorkgroupStorageSize, smemPerSM: L.maxComputeWorkgroupStorageSize * 2 });
      this.status = "ready";
      this.device.lost.then((e) => { this.status = "lost: " + (e?.message || ""); this.device = null; });
      return true;
    } catch (e) { this.status = "unavailable: " + e.message; return false; }
  }
  describe() { return { kind: "your GPU via WebGPU", ...(this.info || {}), status: this.status, "threads/block": this.target.maxThreadsPerBlock, "smem/block": this.target.smemPerBlock + " B", protocol: `${this.protocol.reps} repetitions × ${this.protocol.launches} launches (${this.protocol.warmup} warm-up), seed ${this.protocol.seed}`, ...(this.timerNote ? { timer: this.timerNote } : {}), note: "real execution; every repetition runs each kernel in a fresh GPUDevice; timing from timestamp queries when the adapter allows them, else from queue completion" }; }
  async pipelineFor(kern) {
    let p = this.cache.get(kern.wgsl);
    if (!p) this.cache.set(kern.wgsl, (p = await compilePipeline(this.device, kern)));
    return p;
  }
  /**
   * A fresh context: an adapter creates one device, so this asks for a new adapter each time, and refuses one that
   * is not the GPU the device was fingerprinted from (its numbers would carry the wrong device id).
   */
  async freshDevice() {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) throw new Error("no WebGPU adapter");
    const info = adapter.info || {}, fp = this.fingerprint;
    const now = { vendor: info.vendor || "", architecture: info.architecture || "", device: info.device || "", description: info.description || "", timestamps: adapter.features.has("timestamp-query") };
    const off = Object.keys(now).filter((k) => now[k] !== fp[k]);
    if (off.length) throw new Error(`the adapter is not the probed GPU (${off.map((k) => `${k}: ${fp[k]} → ${now[k]}`).join(", ")})`);
    return adapter.requestDevice({ requiredFeatures: now.timestamps ? ["timestamp-query"] : [], requiredLimits: limitsOf(adapter) });
  }
  /**
   * The protocol (§28) over `kernels`, with `opts` overriding `this.protocol`. The unit of a repetition is one kernel
   * in one fresh GPUDevice: its own pipeline compile, its own buffers. A device per repetition shared by all kernels
   * would let one kernel's allocations and residency shape the next kernel's sample in the same repetition, which
   * is the dependence repetitions exist to break. The extra cost is a device and a pipeline per kernel and
   * repetition: about 1 ms and 0.5 ms on an M1 Pro in Chrome 155 (KILN-001 diary 04, Step 2), small next to the
   * launches themselves.
   */
  async measureKernels(kernels, opts = {}, { onStep } = {}) {
    const p = { ...this.protocol, ...opts };
    for (const [k, min] of [["reps", 1], ["launches", 1], ["warmup", 0]]) if (!Number.isInteger(p[k]) || p[k] < min) throw new RangeError(`protocol.${k} must be an integer ≥ ${min} (got ${p[k]})`);
    if (!(await this.probe())) throw new Error(this.status);
    const kind = this.timestamps ? "gpu-timestamp" : "wall-clock";
    // inputs depend only on the kernel and INPUT_SEED: made once per call (they are the CPU cost of a repetition,
    // ~40 ms for 17 MB), uploaded afresh into every context
    const inputs = new Map();
    const results = await runProtocol(kernels, p, async (kern, { check }) => {
      let ins = inputs.get(kern);
      if (!ins) inputs.set(kern, (ins = kernelInputs(kern, INPUT_SEED)));
      // a GPU that stops answering fails this repetition instead of hanging the measurement; destroying the device
      // settles whatever it still has pending, also when the device arrives after the deadline
      let dev = null;
      const work = (async () => {
        dev = await this.freshDevice();
        return runOnce(dev, await compilePipeline(dev, kern), kern, { warmup: p.warmup, launches: p.launches, timestamps: this.timestamps, check, ins });
      })();
      work.catch(() => {}).finally(() => dev?.destroy());
      try { return await deadline(work, CONTEXT_TIMEOUT_MS, `no answer from the GPU within ${CONTEXT_TIMEOUT_MS / 1000} s`); }
      finally { dev?.destroy(); }
    }, { kind, onStep });
    // a coarse timer is a property of the browser, so it is read from the whole run; its records stay partial
    const q = this.timestamps ? timerQuantum(results.flatMap((r) => (r.raw || []).flat())) : null;
    this.timerNote = null;
    if (q >= 1) {
      const note = q === Infinity ? "timestamps: every launch read 0 µs, below the timer's resolution" : `timestamps quantized to ${+q.toFixed(3)} µs by the browser`;
      for (const r of results) r.partial = [note];
      // shown in Devices: why this browser's records never decide
      this.timerNote = `${note}; these records are partial and never decide. Chrome gives full-resolution timestamps when started with --enable-unsafe-webgpu`;
    }
    return results;
  }
  /** One repetition on the probe's device (cached pipeline): a quick look, not the protocol. */
  async runKernel(kern, { warmup = this.protocol.warmup, launches = this.protocol.launches } = {}) {
    if (!(await this.probe())) throw new Error(this.status);
    const r = await runOnce(this.device, await this.pipelineFor(kern), kern, { warmup, launches, timestamps: this.timestamps, check: true });
    const us = median(r.times);
    return { us, samples: [us], raw: [r.times], kind: this.timestamps ? "gpu-timestamp" : "wall-clock", reps: 1, launches, warmup, metrics: r.metrics, check: r.check };
  }
}

// a CUDA box running runner/kiln_runner.py; live only when this page is served by that runner
export class CudaDevice {
  constructor(base = null) { this.id = "cuda"; this.kind = "cuda"; this.name = "CUDA runner"; this.label = "CUDA · runner"; this.base = base; this.status = "not connected"; this.target = target(SPECS.rtx5090); this.info = null; this.fingerprint = null; this.evidenceId = null; }
  async probe() {
    const base = this.base ?? (typeof location !== "undefined" && /^https?:/.test(location.protocol) ? location.origin : null);
    if (!base) { this.status = "not connected: open the workbench from the runner (python kiln_runner.py serve) or use bundles"; return false; }
    try {
      const r = await fetch(base + "/api/device", { cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      this.adopt(await r.json(), base);
      this.base = base;
      const spec = Object.values(SPECS).find((s) => this.info.cc && String(s.sm) === String(this.info.cc).replace(".", "")) || SPECS.rtx5090;
      this.target = target({ ...spec, name: this.name, sms: this.info.sms || spec.sms, smemPerBlock: this.info.smemPerBlock || spec.smemPerBlock });
      this.status = "ready";
      return true;
    } catch (e) { this.status = "not connected: " + (e.message || e); return false; }
  }
  // identity from the runner's device report: a live probe, or the results file of an offline bundle
  adopt(info, host) {
    this.info = info || {};
    this.name = `CUDA ${this.info.name || ""}`.trim();
    this.label = this.name;
    const flat = Object.fromEntries(Object.entries(this.info).filter(([, v]) => typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v))));
    this.fingerprint = { ...flat, host: String(host) };
    this.evidenceId = deviceId("cuda", this.info.name || "cuda", this.fingerprint);
    this.runnerVersion = this.info.version ?? null;
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
    const check = checkSamples(Float32Array.from(r.samples || []), referenceAt(kn, ins, idx));
    check.n = idx.length;
    const us = r.us_median;
    // one process is one repetition: its sample is the median of the timed launches
    return { us, samples: [us], raw: r.us_all ? [r.us_all] : undefined, kind: "cuda-events", reps: 1, launches: r.us_all?.length, ncu: r.ncu || null, check, metrics: { us, kind: "CUDA events", min: r.us_min, gbs: kn.bytes / us / 1e3, ...(r.ncu || {}), threads: kn.K.block, blocks: kn.K.grid, smem: kn.K.smemBytes, regs: r.regs ?? null }, device: res.device };
  });
}

export function makeDevices() {
  return [...Object.values(SPECS).map((s) => new SimDevice(s)), new WebGpuDevice(), new CudaDevice()];
}
