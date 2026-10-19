import type { CaptureInstance } from '@/lang/env';
import type { EntityKind, Link } from '@/lang/rows';
import { hash, rng, type Rng } from '@/lang/util';
import { missing, val, type Value } from '@/lang/values';

/**
 * Deterministic synthetic runs. Everything here is generated, seeded by the capture's content hash and
 * repetition, and labelled synthetic in every manifest. Shapes follow the intern guide's entity model;
 * magnitudes are invented to make the scenarios legible, not measurements.
 */

export interface RawEntity {
  kind: EntityKind;
  id: string;
  ref: string;
  run: string;
  [k: string]: unknown;
}

export interface GeneratedRun {
  run: RawEntity;
  entities: RawEntity[];
  links: Link[];
}

const MS = 1e6; // nanoseconds per millisecond

class Gen {
  readonly entities: RawEntity[] = [];
  readonly links: Link[] = [];
  constructor(
    readonly runRef: string,
    readonly r: Rng,
    readonly arm: string,
    readonly rep: number,
  ) {}
  /** Every entity carries its run, arm and repetition, so grouping by arm can never merge arms. */
  ent(kind: EntityKind, id: string, fields: Record<string, unknown>): RawEntity {
    const e: RawEntity = { kind, id, ref: `${this.runRef}!${kind}:${id}`, run: this.runRef, arm: this.arm, rep: this.rep, ...fields };
    this.entities.push(e);
    return e;
  }
  link(from: RawEntity, to: RawEntity, rel: string, evidence: Link['evidence'], method: string) {
    this.links.push({ from: from.ref, to: to.ref, rel, evidence, method });
  }
}

interface Coverage {
  complete: boolean;
  trace: { lost: { from: number; to: number; reason: string }[] };
  source: { missing: { code: string; reason: string }[] };
  counters: { unsupported: string[] };
  links: { missing: { rel: string; reason: string; count: number }[] };
}

const emptyCoverage = (): Coverage => ({
  complete: true,
  trace: { lost: [] },
  source: { missing: [] },
  counters: { unsupported: [] },
  links: { missing: [] },
});

const spec = (inst: CaptureInstance) => inst.spec as Record<string, Record<string, unknown> | null | undefined>;

function startedAt(inst: CaptureInstance, rep: number): string {
  const n = parseInt(hash(`${inst.hash}#${rep}`).slice(0, 6), 16);
  const day = 1 + (n % 11);
  const minutes = (n >> 4) % (12 * 60);
  const d = new Date(Date.UTC(2026, 9, day, 8 + Math.floor(minutes / 60), minutes % 60));
  return d.toISOString();
}

export function generateRun(inst: CaptureInstance, rep: number): GeneratedRun {
  const runRef = `${inst.ref}#${rep}`;
  const g = new Gen(runRef, rng(`${inst.hash}#${rep}`), inst.arm, rep);
  const cov = emptyCoverage();
  const standard = ['timing', 'trace', 'kernels', 'memory'].includes(inst.mode);
  const out = !standard
    ? genCollector(g, inst)
    : inst.workload.adapter === 'embedding'
      ? genEmbedding(g, inst, rep, cov)
      : genDino(g, inst, rep, cov);
  cov.complete = cov.trace.lost.length === 0 && cov.links.missing.length === 0;
  const s = spec(inst);
  const run: RawEntity = {
    kind: 'run',
    id: runRef,
    ref: runRef,
    run: runRef,
    experiment: inst.experiment,
    arm: inst.arm,
    mode: inst.mode,
    rep,
    specHash: inst.hash,
    host: inst.host,
    rev: inst.rev,
    workload: inst.workload.adapter,
    manifest: {
      workload: inst.workload.adapter,
      boundary: s.workload?.boundary ?? null,
      fixtures: inst.workload.opts.fixtures ?? null,
      precision: inst.workload.opts.precision ?? null,
      inputSize: inst.workload.opts.inputSize ?? null,
      host: inst.host,
      revision: inst.rev,
      arm: inst.arm,
      mode: inst.mode,
      state: s.state ?? null,
      gate: s.quality_gate_sha256 ? `sha256:${String(s.quality_gate_sha256)}` : null,
      toolchain: inst.host === 'playback@dgx' ? 'torch 2.10 · triton 3.5 · CUDA 13 (synthetic)' : 'torch 2.10 · triton 3.5 · CUDA 13 (synthetic)',
      specHash: inst.hash,
      synthetic: true,
    },
    validity: out.validity,
    activation: out.activation,
    quality: { gate: s.quality_gate_sha256 ? 'declared' : 'none', status: !s.quality_gate_sha256 ? 'unqualified' : out.validity.ok ? 'qualified' : 'unqualified' },
    coverage: cov,
    clock: inst.mode === 'timing' ? 'monotonic (client)' : 'CUPTI-correlated CPU/GPU (synthetic)',
    startedAt: startedAt(inst, rep),
    durationS: out.durationS,
    requests: out.requests,
    synthetic: true,
  };
  return { run, entities: g.entities, links: g.links };
}

interface RunOutcome {
  validity: { ok: boolean; reasons: string[] };
  activation: Record<string, string>;
  durationS: number;
  requests: number;
}

// ── Custom collectors ───────────────────────────────────────────────────────

/** Samples for collectors declared with defineCollector; only gpu-clocks has a synthetic shape. */
function genCollector(g: Gen, inst: CaptureInstance): RunOutcome {
  const r = g.r;
  const corunner = String(((spec(inst).comparison?.corunner ?? {}) as Record<string, unknown>).name ?? 'none');
  const every = 0.1;
  const n = 200;
  const throttle = corunner === 'gpu-compute' ? 0.78 : corunner === 'cpu-bandwidth' ? 0.98 : 1;
  for (let i = 0; i < n; i++) {
    const t = i * every;
    const sm = 2405 * throttle * r.normal(1, 0.01);
    const memNa = i === 57;
    g.ent('instant', `clk${String(i).padStart(3, '0')}`, {
      type: 'gpu.clocks', t, arm: inst.arm,
      sm: Math.round(sm),
      mem: memNa ? missing('nvidia-smi reported [N/A]', { unit: 'MHz' }) : Math.round(8001 * r.normal(1, 0.002)),
      power: Math.round((corunner === 'gpu-compute' ? 96 : 71) * r.normal(1, 0.03)),
      temp: Math.round(52 + t * 0.05 + r.normal(0, 0.4)),
    });
  }
  return { validity: { ok: true, reasons: [] }, activation: {}, durationS: n * every, requests: 0 };
}

// ── DINO ────────────────────────────────────────────────────────────────────

interface KernelSpec {
  name: string;
  role: string;
  op: string;
  ms: number;
  compiler: 'cuBLAS' | 'cuDNN' | 'aten' | 'inductor' | 'driver';
  source: string | null;
  lane?: string;
}

const SRC_FUSION = 'd59d9ad0:services/detection/src/detection/backends/grounding_dino_fusion.py#_make_source';
const SRC_GRID = 'pytorch:aten/src/ATen/native/cuda/GridSampler.cu#grid_sampler_2d_kernel';
const SRC_REDUCE = 'pytorch:aten/src/ATen/native/cuda/Reduce.cuh#reduce_kernel';
const SRC_NORM = '3496baed:spikes/19-embedding-comparison/optimization/norm.py#norm_kernel';

function dinoKernels(fused: boolean, gpuScale: number): KernelSpec[] {
  const k = (name: string, role: string, op: string, ms: number, compiler: KernelSpec['compiler'], source: string | null, lane?: string): KernelSpec => ({
    name, role, op, ms: ms * gpuScale, compiler, source, lane,
  });
  const out: KernelSpec[] = [];
  for (let i = 0; i < 10; i++) out.push(k('sm90_xmma_gemm_f16f16_f32_tn_n', 'backbone.linear', 'backbone.linear', fused ? 1.7 : 1.8, 'cuBLAS', null));
  for (let i = 0; i < 4; i++) out.push(k('implicit_convolve_sgemm', 'backbone.conv', 'backbone.conv', fused ? 2.0 : 2.2, 'cuDNN', null));
  for (let l = 0; l < 6; l++) {
    if (fused) {
      out.push(k('triton_red_fused_sampling_reduce_0', 'encoder.sampling', 'encoder.deformable_attn', 0.96, 'inductor', SRC_FUSION));
    } else {
      out.push(k('grid_sampler_2d_kernel', 'encoder.sampling', 'encoder.deformable_attn', 2.4, 'aten', SRC_GRID));
      out.push(k('reduce_kernel<sum,weighted>', 'encoder.reduce', 'encoder.deformable_attn', 1.6, 'aten', SRC_REDUCE));
    }
    out.push(k('sm90_xmma_gemm_f16f16_f32_tn_n', 'encoder.linear', 'encoder.linear', fused ? 0.85 : 0.9, 'cuBLAS', null));
    out.push(k('sm90_xmma_gemm_f16f16_f32_tn_n', 'encoder.linear', 'encoder.linear', fused ? 0.85 : 0.9, 'cuBLAS', null));
    out.push(
      fused
        ? k('triton_per_fused_native_layer_norm_1', 'encoder.norm', 'encoder.norm', 0.15, 'inductor', 'd59d9ad0:inductor-generated (archived with run)')
        : k('vectorized_layer_norm_kernel', 'encoder.norm', 'encoder.norm', 0.3, 'aten', 'pytorch:aten/src/ATen/native/cuda/layer_norm_kernel.cu'),
    );
  }
  for (let l = 0; l < 6; l++) {
    for (let j = 0; j < 3; j++) out.push(k('sm90_xmma_gemm_f16f16_f32_tn_n', 'decoder.linear', 'decoder.linear', fused ? 0.65 : 0.7, 'cuBLAS', null));
    out.push(
      fused
        ? k('triton_poi_fused__softmax_2', 'decoder.softmax', 'decoder.softmax', 0.2, 'inductor', 'd59d9ad0:inductor-generated (archived with run)')
        : k('softmax_warp_forward', 'decoder.softmax', 'decoder.softmax', 0.25, 'aten', 'pytorch:aten/src/ATen/native/cuda/PersistentSoftmax.cuh'),
    );
    if (!fused) out.push(k('elementwise_kernel', 'decoder.elementwise', 'decoder.elementwise', 0.2, 'aten', 'pytorch:aten/src/ATen/native/cuda/CUDALoops.cuh'));
  }
  return out;
}

function dinoProfile(inst: CaptureInstance, rep: number) {
  const opts = inst.workload.opts;
  const precision = String(opts.precision ?? 'fp16');
  const s = spec(inst);
  const sw = (s.comparison?.switches ?? null) as Record<string, boolean> | null;
  const role = inst.armRole;
  const features = sw
    ? { norm: Boolean(sw.exact_normalization), bulk: Boolean(sw.bulk_transfers), replay: Boolean(sw.replay) }
    : role === 'baseline'
      ? { norm: false, bulk: false, replay: false }
      : { norm: true, bulk: true, replay: true };
  const failure = features.replay && precision === 'fp32' ? 'unsupported precision' : features.replay && rep === 7 ? 'capture failed (nonfatal)' : null;
  const replayOk = features.replay && !failure;
  const activation: Record<string, string> = features.replay
    ? replayOk
      ? { replay: 'hit', fusion: 'active' }
      : { replay: 'fallback', fusion: 'inactive', reason: failure ?? '' }
    : { replay: 'off', fusion: 'off' };
  const expect = s.expect as { expect?: Record<string, string>; arm?: string; onMiss?: string } | null;
  const reasons: string[] = [];
  if (expect?.expect && (!expect.arm || expect.arm === inst.arm)) {
    for (const [k, v] of Object.entries(expect.expect)) {
      if (activation[k] !== v && (expect.onMiss ?? 'invalid') === 'invalid') reasons.push(`activation: ${k} ${activation[k]} (expected ${v})${failure ? ` — ${failure}` : ''}`);
    }
  }
  const dgx = inst.host === 'playback@dgx';
  const corunner = String(((s.comparison?.corunner ?? {}) as Record<string, unknown>).name ?? 'none');
  const gpuScale = (dgx ? 1 : 0.45) * (precision === 'fp32' ? 1.9 : 1) * (corunner === 'gpu-compute' ? 1.7 : corunner === 'cpu-bandwidth' ? 1.08 : 1);
  const cpuScale = (dgx ? 1 : 0.7) * (corunner === 'cpu-bandwidth' ? 1.35 : 1);
  return { features, replayOk, activation, validity: { ok: reasons.length === 0, reasons }, gpuScale, cpuScale, precision };
}

function genDino(g: Gen, inst: CaptureInstance, rep: number, cov: Coverage): RunOutcome {
  const p = dinoProfile(inst, rep);
  const r = g.r;
  const kernels = dinoKernels(p.replayOk, p.gpuScale);
  const gpuMs = kernels.reduce((a, k) => a + k.ms, 0);
  const cpu = {
    decode: 8 * p.cpuScale,
    normalize: (p.features.norm ? 1.2 : 11) * p.cpuScale,
    tokenize: 0.6 * p.cpuScale,
    copies: p.features.bulk ? 1 : 28,
    copyMs: p.features.bulk ? 1.1 : 1.2,
    result: 2 * p.cpuScale,
  };
  const layout = `768x768/${p.precision}`;
  const invalidReason = p.validity.reasons[0];

  if (inst.mode === 'timing') {
    const n = 40;
    let t = 0;
    const base = cpu.decode + cpu.normalize + cpu.tokenize + gpuMs + cpu.copies * cpu.copyMs + cpu.result + (p.replayOk ? 0.45 : kernels.length * 0.06);
    for (let i = 0; i < n; i++) {
      const outlier = r.chance(0.025) ? r.range(1.5, 2.1) : 1;
      const latency = Math.max(1, base * r.normal(1, 0.035) * outlier);
      t += latency / 1000 + 0.002;
      g.ent('request', `r${rep}-${String(i).padStart(3, '0')}`, {
        arm: inst.arm, rep, t, latency, timeInSystem: latency, outcome: 'ok', batch: i, layout, warm: true,
        runValid: p.validity.ok, invalidReason,
      });
    }
    return { validity: p.validity, activation: p.activation, durationS: t, requests: n };
  }

  if (inst.mode === 'memory') return dinoMemory(g, p);

  // trace and kernels captures share one execution model; kernels captures profile one request.
  const n = inst.mode === 'kernels' ? 1 : Number((spec(inst).collection as Record<string, unknown>)?.requests ?? 24);
  const selected = (spec(inst).collection as { launch?: { name?: string } } | undefined)?.launch?.name;
  const sections = new Set(((spec(inst).collection as { sections?: string[] } | undefined)?.sections ?? []) as string[]);
  const codes = new Map<string, RawEntity>();
  const ops = new Map<string, RawEntity>();
  const codeFor = (k: KernelSpec) => {
    let c = codes.get(k.name);
    if (!c) {
      c = g.ent('code', `code-${hash(k.name).slice(0, 6)}`, {
        name: k.name,
        compiler: k.compiler,
        source: k.source,
        sourceReason: k.source ? undefined : 'library kernel, no symbols',
        codeHash: `sha256:${hash(`${k.name}:${inst.rev}`)}`,
      });
      codes.set(k.name, c);
      if (!k.source && !cov.source.missing.some((m) => m.code === k.name)) cov.source.missing.push({ code: k.name, reason: 'library kernel, no symbols' });
      let o = ops.get(k.op);
      if (!o) {
        o = g.ent('op', `op-${k.op}`, { name: k.op });
        ops.set(k.op, o);
      }
      g.link(c, o, 'implements', k.compiler === 'inductor' ? 'derived' : 'heuristic', k.compiler === 'inductor' ? 'inductor source map' : 'aten op name');
    }
    return c;
  };

  let cursor = 0;
  let droppedLaunchLinks = 0;
  for (let i = 0; i < n; i++) {
    const start = cursor;
    const noise = r.normal(1, 0.02);
    const req = g.ent('request', `r${rep}-${String(i).padStart(3, '0')}`, {
      arm: inst.arm, rep, layout, outcome: 'ok', batch: i, warm: i >= 2, runValid: p.validity.ok, invalidReason,
      start, t: start / 1e9,
    });
    let cpuT = start;
    const span = (name: string, ms: number, extra: Record<string, unknown> = {}) => {
      const s = g.ent('span', `${req.id}-${name}`, { name, lane: 'cpu:main', start: cpuT, end: cpuT + ms * MS, dur: ms, request: req.id, ...extra });
      g.link(req, s, 'contains', 'direct', 'recorder');
      cpuT += ms * MS;
      return s;
    };
    span('decode', cpu.decode * noise);
    span('normalize', cpu.normalize * noise);
    span('tokenize', cpu.tokenize);
    if (p.features.replay) span('layout_key', 0.05);
    const launchStart = cpuT;
    let gpuT = cpuT;
    const launcher = g.ent('span', `${req.id}-${p.replayOk ? 'replay_submit' : 'model_forward'}`, {
      name: p.replayOk ? 'replay_submit' : 'model_forward', lane: 'cpu:main', start: launchStart, end: launchStart, dur: 0, request: req.id,
    });
    g.link(req, launcher, 'contains', 'direct', 'recorder');
    let kIndex = 0;
    for (const ks of kernels) {
      const launchAt = p.replayOk ? launchStart + 0.4 * MS : cpuT + 0.06 * MS;
      if (!p.replayOk) cpuT = launchAt;
      const kStart = Math.max(gpuT, launchAt + 0.01 * MS);
      const dur = ks.ms * r.normal(1, 0.03);
      const kid = `${req.id}-k${String(kIndex).padStart(3, '0')}`;
      const isSelected = inst.mode === 'kernels' && !!selected && ks.name === selected;
      const kern = g.ent('kernel', kid, {
        name: ks.name, role: ks.role, op: ks.op, lane: 'cuda:stream 7', start: kStart, end: kStart + dur * MS, dur, request: req.id,
        layout, warm: i >= 2, code: codeFor(ks).id, grid: ks.compiler === 'cuBLAS' ? '[132,1,1]' : '[3060,1,1]', block: ks.compiler === 'cuBLAS' ? '[384,1,1]' : '[128,1,1]',
        selected: isSelected,
        metrics: inst.mode === 'kernels' ? (kernelMetrics(ks, sections, isSelected, `${g.runRef}/report.ncu-rep`) ?? {}) : undefined,
      });
      gpuT = kStart + dur * MS;
      // graph replay does not re-emit host ranges per node: three decoder nodes of the first request lose their link
      if (p.replayOk && i === 0 && ks.role === 'decoder.softmax' && droppedLaunchLinks < 3) droppedLaunchLinks++;
      else g.link(launcher, kern, 'launches', 'direct', p.replayOk ? 'CUDA graph launch correlation' : 'CUPTI correlation id');
      g.link(kern, codeFor(ks), 'compiled_from', 'direct', 'code sha256');
      kIndex++;
    }
    if (p.replayOk) cpuT = launchStart + 0.4 * MS;
    (launcher as Record<string, unknown>).end = cpuT;
    (launcher as Record<string, unknown>).dur = (cpuT - launchStart) / MS;
    // postprocess waits for the stream, then copies results to the host
    const ppStart = Math.max(cpuT, gpuT);
    const pp = g.ent('span', `${req.id}-postprocess`, { name: 'postprocess', lane: 'cpu:main', start: cpuT, end: 0, dur: 0, request: req.id, waitsOn: 'cuda:stream 7' });
    g.link(req, pp, 'contains', 'direct', 'recorder');
    let copyT = ppStart;
    for (let c = 0; c < cpu.copies; c++) {
      const dur = cpu.copyMs * r.normal(1, 0.05);
      const ks: KernelSpec = { name: p.features.bulk ? 'Memcpy DtoH (bulk)' : 'Memcpy DtoH (Pageable)', role: 'postprocess.transfer', op: 'postprocess.transfer', ms: dur, compiler: 'driver', source: null };
      const kern = g.ent('kernel', `${req.id}-c${String(c).padStart(2, '0')}`, {
        name: ks.name, role: ks.role, op: ks.op, lane: 'cuda:copy', start: copyT, end: copyT + dur * MS, dur, request: req.id, layout, warm: i >= 2, code: codeFor(ks).id,
      });
      g.link(pp, kern, 'launches', 'direct', 'CUPTI correlation id');
      copyT += dur * MS + 0.02 * MS;
    }
    (pp as Record<string, unknown>).end = copyT;
    (pp as Record<string, unknown>).dur = (copyT - cpuT) / MS;
    cpuT = copyT;
    span('cpu_result', cpu.result);
    const end = cpuT;
    Object.assign(req, { end, latency: (end - start) / MS, timeInSystem: (end - start) / MS, tEnd: end / 1e9 });
    cursor = end + 0.5 * MS;
  }
  if (droppedLaunchLinks) cov.links.missing.push({ rel: 'launches', reason: 'graph replay does not re-emit host ranges per node', count: droppedLaunchLinks });
  return { validity: p.validity, activation: p.activation, durationS: cursor / 1e9, requests: n };
}

/** ncu-style metrics for profiled kernels; sections decide which families exist at all. */
function kernelMetrics(k: KernelSpec, sections: Set<string>, selected: boolean, report: string): Record<string, Value> | undefined {
  const profiled = selected || k.role.startsWith('encoder.') || (k.role === 'backbone.linear');
  if (!profiled) return undefined;
  const fam: Record<string, Record<string, [number, string, string?]>> = {
    'encoder.sampling': {
      launch__registers_per_thread: [k.compiler === 'inductor' ? 72 : 40, 'register/thread'],
      launch__shared_mem_per_block_static: [0, 'B'],
      'sm__warps_active.avg.pct_of_peak_sustained_active': [k.compiler === 'inductor' ? 38.4 : 71.2, '%', 'peak sustained active'],
      sm__maximum_warps_per_active_cycle_pct: [k.compiler === 'inductor' ? 50 : 100, '%', 'theoretical'],
      'dram__bytes_read.sum': [k.compiler === 'inductor' ? 9.6e6 : 18.1e6, 'B'],
      'dram__bytes_write.sum': [k.compiler === 'inductor' ? 3.1e6 : 201.3e6, 'B'],
      'lts__t_bytes.sum': [k.compiler === 'inductor' ? 41.2e6 : 236.4e6, 'B'],
      'smsp__average_warps_issue_stalled_long_scoreboard_per_issue_active.ratio': [k.compiler === 'inductor' ? 4.2 : 2.1, 'ratio', 'issue active'],
      'smsp__average_warps_issue_stalled_barrier_per_issue_active.ratio': [k.compiler === 'inductor' ? 0.31 : 0.02, 'ratio', 'issue active'],
      smsp__pcsamp_warps_issue_stalled_barrier: [k.compiler === 'inductor' ? 1840 : 120, 'samples'],
      smsp__pcsamp_warps_issue_stalled_long_scoreboard: [k.compiler === 'inductor' ? 14210 : 6020, 'samples'],
    },
    'encoder.reduce': {
      launch__registers_per_thread: [32, 'register/thread'],
      launch__shared_mem_per_block_static: [4096, 'B'],
      'sm__warps_active.avg.pct_of_peak_sustained_active': [64.0, '%', 'peak sustained active'],
      sm__maximum_warps_per_active_cycle_pct: [100, '%', 'theoretical'],
      'dram__bytes_read.sum': [199.6e6, 'B'],
      'dram__bytes_write.sum': [3.1e6, 'B'],
      'lts__t_bytes.sum': [212.0e6, 'B'],
      'smsp__average_warps_issue_stalled_long_scoreboard_per_issue_active.ratio': [3.4, 'ratio', 'issue active'],
      'smsp__average_warps_issue_stalled_barrier_per_issue_active.ratio': [0.6, 'ratio', 'issue active'],
      smsp__pcsamp_warps_issue_stalled_barrier: [2100, 'samples'],
      smsp__pcsamp_warps_issue_stalled_long_scoreboard: [9020, 'samples'],
    },
  };
  const gemm: Record<string, [number, string, string?]> = {
    launch__registers_per_thread: [168, 'register/thread'],
    launch__shared_mem_per_block_static: [98304, 'B'],
    'sm__warps_active.avg.pct_of_peak_sustained_active': [18.2, '%', 'peak sustained active'],
    sm__maximum_warps_per_active_cycle_pct: [25, '%', 'theoretical'],
    'dram__bytes_read.sum': [24.0e6, 'B'],
    'dram__bytes_write.sum': [6.2e6, 'B'],
    'lts__t_bytes.sum': [96.0e6, 'B'],
    'smsp__average_warps_issue_stalled_long_scoreboard_per_issue_active.ratio': [0.9, 'ratio', 'issue active'],
    'smsp__average_warps_issue_stalled_barrier_per_issue_active.ratio': [0.4, 'ratio', 'issue active'],
    smsp__pcsamp_warps_issue_stalled_barrier: [380, 'samples'],
    smsp__pcsamp_warps_issue_stalled_long_scoreboard: [700, 'samples'],
  };
  const table = fam[k.role] ?? gemm;
  const bySection: Record<string, string[]> = {
    LaunchStats: ['launch__registers_per_thread', 'launch__shared_mem_per_block_static'],
    Occupancy: ['sm__warps_active.avg.pct_of_peak_sustained_active', 'sm__maximum_warps_per_active_cycle_pct'],
    MemoryWorkloadAnalysis: ['dram__bytes_read.sum', 'dram__bytes_write.sum', 'lts__t_bytes.sum'],
    WarpStateStats: [
      'smsp__average_warps_issue_stalled_long_scoreboard_per_issue_active.ratio',
      'smsp__average_warps_issue_stalled_barrier_per_issue_active.ratio',
    ],
    SourceCounters: ['smsp__pcsamp_warps_issue_stalled_barrier', 'smsp__pcsamp_warps_issue_stalled_long_scoreboard'],
  };
  const out: Record<string, Value> = {
    'gpu__time_duration.sum': val(Number((k.ms * 1.04).toFixed(3)), { unit: 'ms', scope: 'kernel launch', source: report, method: 'ncu replay=kernel (cache control: all)', metric: 'gpu__time_duration.sum' }),
  };
  for (const [section, names] of Object.entries(bySection)) {
    if (!sections.has(section)) continue;
    for (const name of names) {
      const [v, unit, denominator] = table[name];
      out[name] = val(v, { unit, denominator, scope: 'kernel launch', source: report, method: `ncu section ${section}`, metric: name });
    }
  }
  if (out['dram__bytes_read.sum'] && out['dram__bytes_write.sum']) {
    out['dram__bytes.sum'] = val(Number(out['dram__bytes_read.sum'].value) + Number(out['dram__bytes_write.sum'].value), {
      unit: 'B', scope: 'kernel launch', source: report, method: 'ncu section MemoryWorkloadAnalysis', metric: 'dram__bytes.sum',
    });
  }
  return out;
}

function dinoMemory(g: Gen, p: ReturnType<typeof dinoProfile>): RunOutcome {
  const report = `${g.runRef}/memory_history.pickle`;
  const replay = p.replayOk;
  const gen = replay ? g.ent('graphgen', 'G1', { generation: 1, layout: `768x768/${p.precision}`, capturedAt: 0.82, evictedAt: null, retainedBytes: 0 }) : null;
  const tensors = [
    { id: 'value', role: 'encoder.value', shape: [1, 12240, 8, 32], dtype: { name: 'float32', bytes: 4 } },
    { id: 'sampling_locations', role: 'encoder.sampling_locations', shape: [1, 12240, 8, 4, 4, 2], dtype: { name: 'float32', bytes: 4 } },
    { id: 'attention_weights', role: 'encoder.attention_weights', shape: [1, 12240, 8, 4, 4], dtype: { name: 'float32', bytes: 4 } },
    { id: 'sampled_intermediate', role: 'sampled_intermediate', shape: [8, 32, 12240, 16], dtype: { name: 'float32', bytes: 4 } },
    { id: 'output', role: 'encoder.output', shape: [1, 12240, 256], dtype: { name: 'float32', bytes: 4 } },
  ];
  const ents: Record<string, RawEntity> = {};
  let retained = 0;
  for (const t of tensors) {
    const numel = t.shape.reduce((a, b) => a * b, 1);
    const bytes = numel * t.dtype.bytes;
    const block = Math.ceil(bytes / (2 * 1024 * 1024)) * 2 * 1024 * 1024;
    const tensor = g.ent('tensor', t.id, { name: t.id, role: t.role, shape: t.shape, dtype: t.dtype, numel, storage: `S-${t.id}` });
    const alloc = g.ent('alloc', `B-${t.id}`, {
      name: `block for ${t.id}`, bytes: block, requested: bytes, pool: replay ? 'graph pool (G1)' : 'caching allocator', scope: 'allocator',
      retainedBy: replay ? 'G1' : null, lifetime: replay ? 'retained by graph' : t.id === 'sampled_intermediate' ? 'freed after reduce' : 'request',
      generation: 1, address: `0x7f${hash(t.id).slice(0, 8)}`, source: report,
    });
    g.link(tensor, alloc, 'aliases', 'direct', 'allocator trace');
    if (gen) {
      g.link(gen, alloc, 'retains', 'direct', 'graph private pool');
      retained += block;
    }
    ents[t.id] = tensor;
  }
  if (gen) (gen as Record<string, unknown>).retainedBytes = retained;
  // traffic ledger: kernels touching the encoder tensors, with measured DRAM bytes
  const k = (id: string, name: string, role: string, read: number, write: number, reads: string[], writes: string[]) => {
    const kern = g.ent('kernel', id, {
      name, role, op: 'encoder.deformable_attn', lane: 'cuda:stream 7', dur: role === 'encoder.sampling' ? (replay ? 0.96 : 2.4) : 1.6,
      metrics: {
        'dram__bytes_read.sum': val(read, { unit: 'B', scope: 'kernel launch', source: `${g.runRef}/traffic.ncu-rep`, method: 'ncu section MemoryWorkloadAnalysis', metric: 'dram__bytes_read.sum' }),
        'dram__bytes_write.sum': val(write, { unit: 'B', scope: 'kernel launch', source: `${g.runRef}/traffic.ncu-rep`, method: 'ncu section MemoryWorkloadAnalysis', metric: 'dram__bytes_write.sum' }),
        'dram__bytes.sum': val(read + write, { unit: 'B', scope: 'kernel launch', source: `${g.runRef}/traffic.ncu-rep`, method: 'ncu section MemoryWorkloadAnalysis', metric: 'dram__bytes.sum' }),
      },
    });
    for (const t of reads) g.link(kern, ents[t], 'reads', 'derived', 'kernel arguments + allocator trace');
    for (const t of writes) g.link(kern, ents[t], 'writes', 'derived', 'kernel arguments + allocator trace');
    return kern;
  };
  if (replay) {
    k('k-fused', 'triton_red_fused_sampling_reduce_0', 'encoder.sampling', 9.6e6, 3.1e6, ['value', 'sampling_locations', 'attention_weights'], ['output']);
  } else {
    k('k-grid', 'grid_sampler_2d_kernel', 'encoder.sampling', 18.1e6, 201.3e6, ['value', 'sampling_locations'], ['sampled_intermediate']);
    k('k-reduce', 'reduce_kernel<sum,weighted>', 'encoder.reduce', 199.6e6, 3.1e6, ['sampled_intermediate', 'attention_weights'], ['output']);
  }
  // process-level ledger entries are a different scope and are never summed with allocator blocks
  g.ent('alloc', 'rss', { name: 'process RSS', bytes: (replay ? 3.31 : 2.93) * 1024 ** 3, scope: 'process', retainedBy: null, lifetime: 'sampled', source: `${g.runRef}/proc_status` });
  g.ent('alloc', 'cgroup-peak', { name: 'cgroup memory.peak', bytes: (replay ? 4.02 : 3.77) * 1024 ** 3, scope: 'process', retainedBy: null, lifetime: 'peak', source: `${g.runRef}/memory.peak` });
  return { validity: p.validity, activation: p.activation, durationS: 1.2, requests: 1 };
}

// ── Embedding ───────────────────────────────────────────────────────────────

const LAYOUTS = ['A', 'B', 'C', 'D', 'E', 'F'];
const LAYOUT_BYTES: Record<string, number> = { A: 1.86, B: 2.31, C: 2.74, D: 3.09, E: 3.4, F: 3.7 };

function parseRate(v: unknown): number {
  const m = /^([\d.]+)/.exec(String(v ?? '6'));
  return m ? Number(m[1]) : 6;
}
function parseSeconds(v: unknown, fallback: number): number {
  const m = /^([\d.]+)\s*(ms|s|m)?$/.exec(String(v ?? ''));
  if (!m) return fallback;
  const n = Number(m[1]);
  return m[2] === 'ms' ? n / 1000 : m[2] === 'm' ? n * 60 : n;
}

function genEmbedding(g: Gen, inst: CaptureInstance, rep: number, cov: Coverage): RunOutcome {
  const r = g.r;
  const s = spec(inst);
  const offer = (s.offer ?? {}) as Record<string, unknown>;
  const rate = parseRate(offer.rate);
  const duration = parseSeconds(offer.duration, 120);
  const deadlineMs = parseSeconds(s.deadline, 2) * 1000;
  const maxOutstanding = Number((s.admission as Record<string, unknown> | null)?.maxOutstanding ?? 16);
  const phases = ((s.phases as unknown as { name: string; type: string; opts: Record<string, unknown> }[]) ?? []).length
    ? (s.phases as unknown as { name: string; type: string; opts: Record<string, unknown> }[])
    : [{ name: 'steady', type: 'stable', opts: { layouts: 1 } }];
  const candidate = inst.armRole !== 'baseline';
  const capacity = 2;
  const dgx = inst.host === 'playback@dgx';
  const scale = dgx ? 1 : 0.55;
  const traced = inst.mode === 'trace';
  const collection = (s.collection ?? {}) as Record<string, unknown>;
  const lost = traced && rep === 2 && !collection.buffer ? { from: 41.2, to: 43.9, reason: 'CUPTI buffer overflow' } : null;
  if (lost) cov.trace.lost.push(lost);

  // open-loop arrivals over the offer window
  const arrivals: number[] = [];
  let t = 0;
  while (true) {
    t += -Math.log(1 - r.next()) / rate;
    if (t > duration) break;
    arrivals.push(t);
  }
  const phaseOf = (at: number) => phases[Math.min(phases.length - 1, Math.floor((at / duration) * phases.length))];
  const lru: string[] = [];
  let generation = 0;
  const genByLayout = new Map<string, RawEntity>();
  let serverFree = 0;
  const inSystem: number[] = [];
  let alt = 0;
  const codes = new Map<string, RawEntity>();
  const codeFor = (name: string, source: string | null, compiler: string) => {
    let c = codes.get(name);
    if (!c) {
      c = g.ent('code', `code-${hash(name).slice(0, 6)}`, { name, compiler, source, sourceReason: source ? undefined : 'library kernel, no symbols', codeHash: `sha256:${hash(name + inst.rev)}` });
      codes.set(name, c);
      if (!source) cov.source.missing.push({ code: name, reason: 'library kernel, no symbols' });
    }
    return c;
  };
  let requests = 0;
  arrivals.forEach((at, i) => {
    const phase = phaseOf(at);
    const nLayouts = Math.max(1, Number(phase.opts.layouts ?? 1));
    const layout = phase.type === 'stable' ? 'A' : phase.type === 'alternate' ? LAYOUTS[alt++ % nLayouts] : LAYOUTS[r.int(0, nLayouts - 1)];
    const windows = r.int(1, 4);
    const lateness = r.range(0, 2.5);
    // admission: outstanding work at arrival
    while (inSystem.length && inSystem[0] <= at) inSystem.shift();
    const id = `r${rep}-${String(i).padStart(4, '0')}`;
    const base = {
      arm: inst.arm, rep, phase: phase.name, layout, windows, scheduledArrival: at, t: at, submitLateness: lateness,
      runValid: true, batch: `b-${id}`,
    };
    if (inSystem.length >= maxOutstanding) {
      g.ent('request', id, { ...base, outcome: 'rejected', latency: null, timeInSystem: null, queueDelay: null, transition: null });
      requests++;
      return;
    }
    let transition: string | null = null;
    let service: number;
    let gen: RawEntity | undefined;
    if (candidate) {
      const hit = lru.includes(layout);
      if (hit) {
        transition = 'hit';
        lru.splice(lru.indexOf(layout), 1);
        lru.push(layout);
        service = (48 + 11 * windows) * scale;
        gen = genByLayout.get(layout);
      } else if (r.chance(0.01)) {
        transition = 'fallback';
        service = (140 + 14 * windows) * scale;
      } else {
        transition = lru.length >= capacity ? 'evict+capture' : 'capture';
        if (lru.length >= capacity) {
          const evicted = lru.shift()!;
          const eg = genByLayout.get(evicted);
          if (eg) {
            (eg as Record<string, unknown>).evictedAt = at;
            if (traced) g.ent('instant', `${id}-evict`, { type: 'graph.evict', t: at, layout: evicted, generation: eg.generation, phase: phase.name });
          }
          genByLayout.delete(evicted);
        }
        generation++;
        gen = g.ent('graphgen', `G${generation}`, {
          generation, layout, capturedAt: at, evictedAt: null, retainedBytes: LAYOUT_BYTES[layout] * 1024 ** 3, phase: phase.name,
        });
        genByLayout.set(layout, gen);
        lru.push(layout);
        service = (820 + 11 * windows) * scale;
      }
    } else {
      service = (118 + 14 * windows) * scale;
    }
    service *= r.normal(1, 0.04);
    const begin = Math.max(at * 1000, serverFree);
    const end = begin + service;
    serverFree = end;
    inSystem.push(end / 1000);
    inSystem.sort((a, b) => a - b);
    const timeInSystem = end - at * 1000;
    const outcome = timeInSystem > deadlineMs ? 'expired' : 'ok';
    const req = g.ent('request', id, {
      ...base,
      outcome,
      service,
      queueDelay: begin - at * 1000,
      timeInSystem,
      latency: timeInSystem,
      transition,
      generation: gen?.generation ?? null,
      start: at * 1e9,
      end: end * MS,
      tEnd: end / 1000,
      outstandingAtStop: end / 1000 > duration,
    });
    requests++;
    if (traced && transition && transition !== 'hit') {
      g.ent('instant', `${id}-${transition}`, { type: transition === 'fallback' ? 'graph.fallback' : 'graph.capture', t: begin / 1000, layout, generation: gen?.generation ?? null, phase: phase.name });
    } else if (traced && transition === 'hit' && i % 4 === 0) {
      g.ent('instant', `${id}-hit`, { type: 'graph.hit', t: begin / 1000, layout, generation: gen?.generation ?? null, phase: phase.name });
    }
    // batch: logical order vs physical membership (sorted by window length upstream)
    const logical = Array.from({ length: windows }, (_, w) => `${id}.w${w}`);
    const physical = [...logical].sort((a, b) => hash(a).localeCompare(hash(b)));
    const batch = g.ent('batch', `b-${id}`, {
      logicalOrder: logical, physicalMembership: physical, layoutKey: `${layout}:${windows}x[3,384,384]:mask=${hash(layout + windows).slice(0, 6)}`,
      inversePermutation: physical.map((x) => logical.indexOf(x)), request: id,
    });
    g.link(req, batch, 'contains', 'direct', 'recorder');
    if (!traced) return;
    const inLost = lost && at >= lost.from && at <= lost.to;
    if (inLost) return;
    let cpuT = begin * MS;
    const stage = (name: string, ms: number) => {
      const sp = g.ent('span', `${id}-${name}`, { name, lane: 'cpu:worker', start: cpuT, end: cpuT + ms * MS, dur: ms, request: id, phase: phase.name });
      g.link(req, sp, 'contains', 'direct', 'recorder');
      cpuT += ms * MS;
      return sp;
    };
    stage('preprocess', 6 * scale * windows);
    stage('layout_key', 0.2);
    stage('graph_lookup', 0.05);
    const execName = !candidate ? 'eager_forward' : transition === 'hit' ? 'replay_submit' : transition === 'fallback' ? 'eager_forward' : 'capture';
    const exec = stage(execName, transition === 'hit' ? 0.3 : 2);
    let gpuT = cpuT;
    const gpuBudget = Math.max(1, (end - begin) - 6 * scale * windows - 4);
    const kernelPlan: [string, string | null, string, number][] = [
      ['sm90_xmma_gemm_bf16bf16_f32_tn_n', null, 'cuBLAS', 0.22],
      ['triton_red_fused_norm_0', SRC_NORM, 'inductor', 0.06],
      ['flash_fwd_kernel', null, 'flash-attn', 0.28],
      ['sm90_xmma_gemm_bf16bf16_f32_tn_n', null, 'cuBLAS', 0.22],
      ['triton_red_fused_norm_0', SRC_NORM, 'inductor', 0.06],
      ['triton_poi_fused_gelu_1', 'inductor-generated (archived with run)', 'inductor', 0.06],
      ['sm90_xmma_gemm_bf16bf16_f32_tn_n', null, 'cuBLAS', 0.1],
    ];
    kernelPlan.forEach(([name, source, compiler, share], kIdx) => {
      const dur = gpuBudget * share;
      const kern = g.ent('kernel', `${id}-k${kIdx}`, {
        name, role: name.includes('norm') ? 'rmsnorm' : name.includes('gemm') ? 'linear' : name.includes('flash') ? 'attention' : 'elementwise',
        op: name.includes('norm') ? 'encoder.rmsnorm' : name.includes('gemm') ? 'encoder.linear' : name.includes('flash') ? 'encoder.attention' : 'encoder.mlp',
        lane: 'cuda:stream 3', start: gpuT, end: gpuT + dur * MS, dur, request: id, layout, warm: true, phase: phase.name, code: codeFor(name, source, compiler).id,
      });
      g.link(exec, kern, 'launches', 'direct', transition === 'hit' ? 'CUDA graph launch correlation' : 'CUPTI correlation id');
      g.link(kern, codeFor(name, source, compiler), 'compiled_from', 'direct', 'code sha256');
      gpuT += dur * MS;
    });
    cpuT = Math.max(cpuT, gpuT);
    stage('cpu_result', 1.5);
    stage('serialize', 2.5 * windows);
  });
  if (inst.mode === 'memory') {
    for (const gen of g.entities.filter((e) => e.kind === 'graphgen')) {
      const a = g.ent('alloc', `pool-${gen.id}`, {
        name: `graph pool ${gen.id} (${String(gen.layout)})`, bytes: gen.retainedBytes, scope: 'graph', retainedBy: gen.id, lifetime: gen.evictedAt ? 'released at eviction' : 'retained', phase: gen.phase, source: `${g.runRef}/memory_snapshot.pickle`,
      });
      g.link(gen, a, 'retains', 'direct', 'graph private pool');
    }
    g.ent('alloc', 'activations', { name: 'activations (peak)', bytes: 1.12 * 1024 ** 3, scope: 'allocator', retainedBy: null, lifetime: 'request', source: `${g.runRef}/memory_snapshot.pickle` });
    g.ent('alloc', 'weights', { name: 'model weights', bytes: 2.3 * 1024 ** 3, scope: 'allocator', retainedBy: null, lifetime: 'process', source: `${g.runRef}/memory_snapshot.pickle` });
    g.ent('alloc', 'rss', { name: 'process RSS', bytes: 5.9 * 1024 ** 3, scope: 'process', retainedBy: null, lifetime: 'sampled', source: `${g.runRef}/proc_status` });
  }
  const validity = { ok: true, reasons: [] as string[] };
  return {
    validity,
    activation: candidate ? { graph: 'enabled', cacheCapacity: String(capacity) } : { graph: 'off' },
    durationS: Math.max(duration, serverFree / 1000),
    requests,
  };
}

export const syntheticMissing = (reason: string) => missing(reason);
