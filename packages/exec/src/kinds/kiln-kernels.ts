// kiln-kernels/1 (guide §19.2): Kiln's CUDA kernels, timed in isolation by runner/kiln_runner.py inside kiln-perf.
// One capture is one kernel; a group (a Measure, a Compare, a Sweep) runs as one runner invocation per repetition with
// its kernels in the protocol's seeded order. The runner is staged from the server's copy, so a changed runner never
// needs a rebuilt image. Records are projected at the end of the job (finish), in the kiln-measure/1 format.
import { canonicalSource, checkSamples, contentId, cudaDevice, median, RECORD_FORMAT, recordId, sha256Hex, validateContext, type MeasurementRecord, type RecordContext, type SampleCheck } from '@kiln/evidence';
import { collectorById, disturbs } from '../collectors/index.ts';
import type { Capture, Observation } from '../model.ts';
import type { Accepted, FinishContext, WorkloadKind } from '../registry.ts';

export const KERNEL_LIMITS = { kernels: 64, warmup: 1000, launches: 10_000, samples: 4096, inputs: 16, numel: 2 ** 28, source: 1_000_000 };

export interface Activation {
  requested: string | null;
  materialized: string;
  ok: boolean;
  notes: string[];
}

/** One kernel as the page submits it: a job kernel of KILN-002 plus the code generator version. */
export interface KernelInput {
  codegen: string;
  name: string;
  identity: string;
  row: string;
  knobs: Record<string, string | number>;
  /** The page's content id; recomputed and compared */
  contentId: string;
  /** CUDA C++ with one __global__ function */
  source: string;
  /** The entry symbol; when given it must be the source's __global__ function */
  symbol?: string;
  launch: { grid: number; block: number; smem: number };
  /** Seeded inputs; dtype u8 draws bytes (the draw's top byte), f32 (the default) uniform floats in [-1, 1) */
  inputs: { shape: number[]; seed: number; dtype?: 'f32' | 'u8' }[];
  output: number[];
  samples: number[];
  /** Reference values at `samples`, null where the reference is NaN */
  expect: (number | null)[];
  activation?: Activation;
  context?: RecordContext;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isInt = (x: unknown, lo: number, hi: number): x is number => Number.isInteger(x) && (x as number) >= lo && (x as number) <= hi;
const isStr = (x: unknown, max: number): x is string => typeof x === 'string' && x.length > 0 && x.length <= max;
const numel = (shape: readonly number[]) => shape.reduce((a, b) => a * b, 1);
const isShape = (x: unknown): x is number[] => Array.isArray(x) && x.length <= 8 && x.every((d) => isInt(d, 0, KERNEL_LIMITS.numel)) && numel(x as number[]) <= KERNEL_LIMITS.numel;
const firstLine = (s: string) => s.split('\n').find((l) => l.trim())?.slice(0, 500) ?? s.slice(0, 500);

/** The __global__ function a CUDA source defines (the runner finds it the same way, kiln_runner.py kernel_name). */
export function entrySymbol(source: string): string | null {
  return /__global__\s+void\s+(?:__launch_bounds__\s*\([^)]*\)\s*)?(\w+)\s*\(/.exec(source)?.[1] ?? null;
}

/** The content id of a kernel: its source with the entry symbol canonicalised, launch, inputs, output (identity.ts). */
export function kernelContentId(k: Pick<KernelInput, 'codegen' | 'source' | 'launch' | 'inputs' | 'output'>, symbol: string): string {
  return contentId({ codegen: k.codegen, lang: 'cuda', sourceSha256: sha256Hex(canonicalSource(k.source, symbol)), launch: { grid: k.launch.grid, block: k.launch.block, smem: k.launch.smem }, inputs: k.inputs.map((i) => ({ shape: i.shape, seed: i.seed })), output: k.output, target: null });
}

export function acceptKernel(x: unknown, at: string): Accepted<KernelInput> {
  const bad = (message: string): Accepted<KernelInput> => ({ ok: false, status: 400, error: 'bad_request', message });
  if (!isObj(x)) return bad(`${at} must be an object`);
  const k = x;
  if (!isStr(k.codegen, 100)) return bad(`${at}.codegen must name the code generator version (CODEGEN_VERSION)`);
  if (!isStr(k.name, 200)) return bad(`${at}.name must be a non-empty string`);
  if (!isStr(k.identity, 500) || !isStr(k.row, 500)) return bad(`${at}: identity and row must be non-empty strings`);
  if (!isObj(k.knobs) || !Object.values(k.knobs).every((v) => typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v)))) return bad(`${at}.knobs must map names to strings or finite numbers`);
  if (typeof k.contentId !== 'string') return bad(`${at}.contentId must be a string`);
  if (!isStr(k.source, KERNEL_LIMITS.source)) return bad(`${at}.source must be CUDA source of at most ${KERNEL_LIMITS.source} characters`);
  const l = k.launch;
  if (!isObj(l) || !isInt(l.grid, 1, 2 ** 31 - 1) || !isInt(l.block, 1, 1024) || !isInt(l.smem, 0, 1 << 20)) return bad(`${at}.launch must be {grid ≥ 1, block in 1..1024, smem ≥ 0}`);
  if (!Array.isArray(k.inputs) || k.inputs.length > KERNEL_LIMITS.inputs || !k.inputs.every((i) => isObj(i) && isShape(i.shape) && isInt(i.seed, 0, 2 ** 32 - 1) && (i.dtype === undefined || i.dtype === 'f32' || i.dtype === 'u8'))) return bad(`${at}.inputs must be at most ${KERNEL_LIMITS.inputs} {shape, seed, dtype?} with integer seeds and dtype f32 or u8`);
  if (!isShape(k.output) || numel(k.output) < 1) return bad(`${at}.output must be a non-empty shape`);
  const n = numel(k.output);
  if (!Array.isArray(k.samples) || !k.samples.length || k.samples.length > KERNEL_LIMITS.samples || !k.samples.every((s) => isInt(s, 0, n - 1))) return bad(`${at}.samples must be 1..${KERNEL_LIMITS.samples} output indices in 0..${n - 1}`);
  if (!Array.isArray(k.expect) || k.expect.length !== k.samples.length || !k.expect.every((v) => v === null || (typeof v === 'number' && Number.isFinite(v)))) return bad(`${at}.expect must hold one reference value (or null for NaN) per sample index`);
  const a = k.activation;
  if (a !== undefined && !(isObj(a) && (a.requested === null || typeof a.requested === 'string') && typeof a.materialized === 'string' && typeof a.ok === 'boolean' && Array.isArray(a.notes) && a.notes.every((s) => typeof s === 'string'))) return bad(`${at}.activation must be {requested, materialized, ok, notes}`);
  const contextErrors = k.context === undefined ? [] : validateContext(k.context, `${at}.context`);
  if (contextErrors.length) return bad(contextErrors.slice(0, 3).join('; '));
  const input = k as unknown as KernelInput;
  const symbol = entrySymbol(input.source);
  if (!symbol) return bad(`${at}.source has no __global__ function`);
  if (k.symbol !== undefined && k.symbol !== symbol) return bad(`${at}.symbol is ${String(k.symbol)}, but the source's __global__ function is ${symbol}`);
  const got = kernelContentId(input, symbol);
  if (got !== input.contentId) return { ok: false, status: 409, error: 'content_id_mismatch', message: `${at} (${input.name}): the submitted source, launch, inputs and output hash to ${got}, not ${input.contentId}`, extra: { name: input.name, expected: got, got: input.contentId } };
  const c = input.context;
  const copy: KernelInput = {
    codegen: input.codegen, name: input.name, symbol, identity: input.identity, row: input.row, knobs: { ...input.knobs }, contentId: got, source: input.source,
    launch: { grid: input.launch.grid, block: input.launch.block, smem: input.launch.smem },
    inputs: input.inputs.map((i) => ({ shape: [...i.shape], seed: i.seed, ...(i.dtype === 'u8' ? { dtype: 'u8' as const } : {}) })), output: [...input.output], samples: [...input.samples], expect: [...input.expect],
    ...(a ? { activation: { requested: input.activation!.requested, materialized: input.activation!.materialized, ok: input.activation!.ok, notes: [...input.activation!.notes] } } : {}),
    ...(c ? { context: { ...(c.preset !== undefined ? { preset: c.preset } : {}), ...(c.project !== undefined ? { project: c.project } : {}), ...(c.params !== undefined ? { params: { ...c.params } } : {}), ...(c.script !== undefined ? { script: c.script } : {}) } } : {}),
  };
  return { ok: true, input: copy, contentId: got, label: `${input.name} ${input.row}`, symbols: [symbol] };
}

interface KernelResult {
  name: string;
  us_all?: number[];
  samples?: number[];
  regs?: number | null;
  error?: string;
}

const enc = new TextEncoder();

export const kilnKernels: WorkloadKind<KernelInput> = {
  id: 'kiln-kernels/1',
  title: 'Kiln kernels, each timed alone',
  environments: ['kiln-perf'],
  requires: [{ gpu: 'cuda' }, { command: 'nvcc' }, { command: 'python' }],
  inProcess: ['cuda-events', 'ptxas'],
  assets: ['kiln_runner.py'],
  accept: acceptKernel,

  lower(group, rep, ctx, order) {
    const single = group.collectors.some((c) => collectorById.get(c)?.hints?.singleLaunch);
    const kernels = order.map((i) => group.captures[i]!);
    const bundle = {
      format: 'kiln-bundle/1', reps: single ? 1 : group.protocol.launches, warmup: single ? 0 : group.protocol.warmup, ncu: false,
      kernels: kernels.map((c) => {
        const k = c.input as KernelInput;
        return { name: k.name, identity: k.identity, row: k.row, source: k.source, grid: k.launch.grid, block: k.launch.block, smem: k.launch.smem, inputs: k.inputs.map((i) => ({ size: numel(i.shape), seed: i.seed, ...(i.dtype ? { dtype: i.dtype } : {}) })), out: numel(k.output), samples: k.samples };
      }),
    };
    const runner = ctx.stage('runner/kiln_runner.py', ctx.asset('kiln_runner.py'));
    const path = ctx.stage(`bundles/${group.key}-r${rep}.json`, enc.encode(JSON.stringify(bundle)));
    const python = ctx.host.environments[ctx.environment]?.python ?? 'python3';
    const launches = (bundle.reps + bundle.warmup) * kernels.length;
    return [{
      serves: kernels.map((c) => ({ capture: c.id, rep })),
      argv: [python, runner, 'run', path, '--out', '/job/out/results.json'],
      env: { KILN_ARCH: 'native', KILN_CACHE: '/job/cache' },
      mounts: [{ role: 'cache', source: 'kiln-kernels', target: '/job/cache', ro: false }],
      timeoutSeconds: 300 + 60 * kernels.length + Math.ceil(launches / 100),
    }];
  },

  import(out) {
    const serves = out.step.serves;
    const data = out.files.get('results.json');
    const fail = (message: string) => serves.map((s): Observation => ({ type: 'error', capture: s.capture, rep: s.rep, message }));
    if (out.execution?.refused) return fail(`step refused: ${out.execution.refused}`);
    if (!data) {
      const tail = out.log.trim().split('\n').slice(-3).join(' | ');
      const how = out.execution?.timedOut ? `timed out after ${out.execution.seconds} s` : `exited with ${out.execution?.exit ?? 'an unknown status'}`;
      return fail(`the runner ${how}${tail ? `: ${tail}` : ''}`);
    }
    let res: { format?: string; device?: Record<string, unknown>; kernels?: KernelResult[]; runner?: string };
    try {
      res = JSON.parse(new TextDecoder().decode(data));
    } catch {
      return fail('results.json is not JSON');
    }
    if (res.format !== 'kiln-results/1' || !Array.isArray(res.kernels)) return fail('results.json is not kiln-results/1');
    if (res.kernels.length !== serves.length) return fail(`the runner returned ${res.kernels.length} results for ${serves.length} kernels`);
    return serves.map((s, position): Observation => {
      const r = res.kernels![position]!;
      const device = res.device ?? {};
      if (r.error) return { type: 'error', capture: s.capture, rep: s.rep, message: firstLine(String(r.error)), device };
      const us = (r.us_all ?? []).filter((t) => typeof t === 'number' && Number.isFinite(t) && t >= 0);
      if (!us.length) return { type: 'error', capture: s.capture, rep: s.rep, message: 'no timed launch completed', device };
      return { type: 'kernel-launches', capture: s.capture, rep: s.rep, us, position, samples: Array.isArray(r.samples) ? r.samples.map(Number) : [], regs: typeof r.regs === 'number' ? r.regs : null, device: res.device ?? {}, runner: typeof res.runner === 'string' ? res.runner : null };
    });
  },

  finish: (ctx) => kernelRecords(ctx),
};

/** One kiln-measure/1 record per timing capture (guide §23.3), with counts from a counters capture of the same content. */
export function kernelRecords(ctx: FinishContext): MeasurementRecord[] {
  const out: MeasurementRecord[] = [];
  const obsOf = (id: string) => ctx.observations.filter((o) => o.capture === id);
  const counterCaptures = ctx.captures.filter((c) => c.collectors.includes('ncu'));
  for (const c of ctx.captures) {
    if (disturbs(c.collectors, 'latency')) continue;
    const k = c.input as KernelInput;
    const obs = obsOf(c.id).sort((a, b) => a.rep - b.rep);
    const launches = obs.filter((o): o is Extract<Observation, { type: 'kernel-launches' }> => o.type === 'kernel-launches');
    const failures = obs.filter((o): o is Extract<Observation, { type: 'error' }> => o.type === 'error');
    const errors = failures.map((e) => `repetition ${e.rep}: ${e.message}`);
    const first = launches[0];
    // a record needs the device the kernel ran on: when no repetition reached the runner, there is none to name
    const report = first?.device ?? failures.find((f) => f.device)?.device;
    if (!report) continue;
    const device = cudaDevice(report, ctx.hostname);
    const samples: number[] = [], raw: number[][] = [], position: number[] = [], checks: SampleCheck[] = [];
    for (const l of launches) {
      const d = cudaDevice(l.device, ctx.hostname);
      if (d.id !== device.id) {
        errors.push(`repetition ${l.rep}: the device changed (${device.id}, then ${d.id})`);
        continue;
      }
      samples.push(median(l.us)!);
      raw.push(l.us);
      position.push(l.position);
      checks.push(checkSamples(l.samples, k.expect));
    }
    const counts = counterCaptures.find((x) => x.contentId === c.contentId);
    const counterObs = counts ? obsOf(counts.id).find((o): o is Extract<Observation, { type: 'kernel-counters' }> => o.type === 'kernel-counters') : undefined;
    const regs = c.collectors.includes('ptxas') ? (launches.find((l) => l.regs !== null)?.regs ?? null) : null;
    out.push(kernelRecord({ ctx, c, k, samples, raw, position, checks, errors, device, runner: first?.runner ?? null, counters: counterObs?.counters ?? null, regs }));
  }
  return out;
}

function kernelRecord(o: { ctx: FinishContext; c: Capture; k: KernelInput; samples: number[]; raw: number[][]; position: number[]; checks: SampleCheck[]; errors: string[]; device: { id: string; name: string; fingerprint: Record<string, string | number | boolean> }; runner: string | null; counters: Record<string, number> | null; regs: number | null }): MeasurementRecord {
  const { ctx, c, k } = o;
  const { reps, seed, launches, warmup } = c.protocol;
  const completed = ctx.completed.get(c.id) ?? o.samples.length;
  const failed = o.checks.find((x) => !x.ok);
  const check: MeasurementRecord['check'] = { ok: o.checks.length > 0 && !failed, sampled: k.samples.length };
  const maxAbs = o.checks.length ? Math.max(...o.checks.map((x) => x.maxAbs)) : NaN;
  if (Number.isFinite(maxAbs)) check.maxAbsErr = maxAbs;
  check.detail = failed ? failed.message : o.checks.length ? o.checks[0]!.message : `not run: ${o.errors[0] ?? 'no repetition completed'}`;
  const activation: Activation = k.activation ?? { requested: null, materialized: k.row, ok: true, notes: ['activation not checked: the job spec carried none'] };
  const reasons: string[] = [];
  for (const e of o.errors) reasons.push(`repetition error: ${e}`);
  if (failed) reasons.push(`output check: ${failed.message}`);
  else if (!o.checks.length && !o.errors.length) reasons.push('output check: no repetition completed');
  if (!activation.ok) reasons.push(`activation: requested ${activation.requested}, materialised ${activation.materialized}`);
  if (o.samples.length !== reps) reasons.push(`small n: ${o.samples.length} of ${reps} repetitions completed`);
  if (ctx.status === 'failed') reasons.push(`job failed: ${ctx.error}`);
  if (ctx.status === 'cancelled') reasons.push(`job cancelled after ${completed} of ${reps} repetitions`);
  const counts: Record<string, number> = { ...(o.counters ?? {}), ...(o.regs !== null && !o.counters?.ncu_registers ? { regs: o.regs } : {}) };
  const rec: Omit<MeasurementRecord, 'id'> = {
    format: RECORD_FORMAT, at: ctx.at, by: 'job',
    device: { id: o.device.id, class: 'cuda', name: o.device.name, fingerprint: { ...o.device.fingerprint } },
    kernel: { name: k.name, identity: k.identity, row: k.row, knobs: { ...k.knobs }, contentId: c.contentId, lang: 'cuda', sourceSha256: sha256Hex(canonicalSource(k.source, k.symbol!)), launch: { ...k.launch } },
    timing: { kind: 'cuda-events', unit: 'us', samples: o.samples, launches, warmup, raw: o.raw, scope: 'isolated' },
    ...(Object.keys(counts).length ? { counts, countsProv: 'observed' as const, ...(o.counters ? { countsClock: 'base' as const } : {}) } : {}),
    check,
    activation: { requested: activation.requested, materialized: activation.materialized, ok: activation.ok, notes: [...activation.notes] },
    validity: { ok: !reasons.length, reasons, partial: [] },
    // records pair only within a job: the pairing group is named by the job, and by the capture's pairId inside it
    protocol: { reps, seed, position: o.position, pairId: c.pairId === ctx.job ? ctx.job : `${ctx.job}:${c.pairId}` },
    manifest: { codegen: k.codegen, app: ctx.app, ...(o.runner ? { runner: o.runner } : {}), host: ctx.hostname, job: ctx.job, capture: c.id, ...(ctx.archive ? { archive: ctx.archive } : {}) },
    environment: { ...c.environment, docker: { ...c.environment.docker }, threads: c.environment.threads ? { ...c.environment.threads } : null },
    collectors: [...c.collectors],
    ...(k.context ? { context: k.context } : {}),
  };
  return { ...rec, id: recordId(rec) } as MeasurementRecord;
}
