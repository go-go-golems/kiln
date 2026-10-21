// perf-lab-sampler/1: Perf Lab's local workload (deformable-attention sampling in PyTorch, three implementations of
// one function) run by its own entry point, `python -m perf_lab_local.run`, inside a CPU environment. A capture is one
// lab capture: the spec a lab program lowered for one experiment/arm/mode. Each repetition is one process; a group's
// captures run as consecutive processes in the protocol's seeded order. The workload's sources are server files
// staged into the bundle, so their bytes are part of the content id and a changed workload is a new capture.
//
// The entry point measures by itself, by mode: `timing` (per-request wall and thread CPU time), `cpu` (also getrusage
// over the window), `trace` (torch.profiler: requests, record_function ranges, ATen operators) and `memory` (also
// allocator events and the tensor ledger). The importer is Perf Lab's importRepetition, turned into observations.
import { canonicalJSON, missing, observed, sha256Hex } from '@kiln/evidence';
import { labCaptureHash } from '../lab-hash.ts';
import type { Observation } from '../model.ts';
import type { AcceptContext, Accepted, WorkloadKind } from '../registry.ts';

export interface SamplerInput {
  /** The lab program that lowered the capture */
  labId: string;
  /** experiment/arm/mode */
  ref: string;
  /** The lowered capture spec; its cyrb53 is the lab's name for the capture */
  spec: Record<string, unknown>;
}

const ASSETS = ['perf_lab_local/__init__.py', 'perf_lab_local/run.py', 'perf_lab_local/sampler.py'];
const LAB_MODES = ['timing', 'cpu', 'trace', 'memory'];
const REF = /^[A-Za-z0-9_.:-]{1,80}\/[A-Za-z0-9_.:-]{1,80}\/[a-z]{1,20}$/;
const MAX_SPEC = 64 * 1024;

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** The run.py mode a collector set asks for: the most detailed one it includes. */
export const samplerMode = (collectors: readonly string[]): string =>
  collectors.includes('torch-memory') ? 'memory' : collectors.includes('torch-profiler') ? 'trace' : collectors.includes('rusage') ? 'cpu' : 'timing';

/** The spec without what the capture identity holds separately: the collection mode (collectors), the repetition
 * count (protocol) and the host's name (device and environment). */
function contentSpec(spec: Json): Json {
  const { host: _host, repeat: _repeat, ...rest } = spec;
  const { mode: _mode, ...collection } = (isObj(spec.collection) ? spec.collection : {}) as Json;
  return { ...rest, collection };
}

function accept(x: unknown, at: string, ctx: AcceptContext): Accepted<SamplerInput> {
  const bad = (message: string): Accepted<SamplerInput> => ({ ok: false, status: 400, error: 'bad_request', message: `${at}: ${message}` });
  if (!isObj(x)) return bad('must be {labId, ref, spec}');
  if (typeof x.labId !== 'string' || !/^[A-Za-z0-9_.:-]{1,100}$/.test(x.labId)) return bad('labId must be 1..100 letters, digits, _ . : -');
  if (typeof x.ref !== 'string' || !REF.test(x.ref)) return bad('ref must be experiment/arm/mode');
  if (!isObj(x.spec)) return bad('spec must be an object');
  const json = JSON.stringify(x.spec);
  if (json.length > MAX_SPEC) return bad(`spec is larger than ${MAX_SPEC} bytes`);
  const spec = JSON.parse(json) as Json;
  const wl = spec.workload as Json | undefined;
  if (!isObj(wl) || wl.adapter !== 'sampler') return bad('spec.workload.adapter must be "sampler"');
  const mode = (spec.collection as Json | undefined)?.mode;
  if (!LAB_MODES.includes(String(mode))) return bad(`spec.collection.mode must be one of ${LAB_MODES.join(', ')}`);
  const [experiment, arm, refMode] = x.ref.split('/');
  if (spec.experiment_id !== experiment || spec.arm !== arm || refMode !== mode) return bad(`ref ${x.ref} does not name the spec's experiment, arm and mode`);
  const workload = sha256Hex(canonicalJSON(ASSETS.map((name) => [name, sha256Hex(ctx.asset(name))])));
  const contentId = sha256Hex(canonicalJSON({ format: 'perf-lab-sampler/1', spec: contentSpec(spec), workload }));
  return { ok: true, input: { labId: x.labId, ref: x.ref, spec }, contentId, label: x.ref, symbols: [] };
}

export const perfLabSampler: WorkloadKind<SamplerInput> = {
  id: 'perf-lab-sampler/1',
  title: "Perf Lab's local sampler workload (PyTorch on the CPU)",
  environments: ['perf-lab-cpu'],
  requires: [{ module: 'torch' }, { module: 'numpy' }],
  inProcess: ['wall-clock', 'rusage', 'torch-profiler', 'torch-memory'],
  assets: ASSETS,
  accept,

  lower(group, rep, ctx, order) {
    const mode = samplerMode(group.collectors);
    for (const name of ASSETS) ctx.stage(`workload/${name}`, ctx.asset(name));
    const python = ctx.host.environments[ctx.environment]?.python ?? 'python3';
    return order.map((i) => {
      const c = group.captures[i]!;
      const input = c.input as SamplerInput;
      const spec = { ...input.spec, collection: { ...(input.spec.collection as Json), mode } };
      const path = ctx.stage(`specs/${c.id}.json`, new TextEncoder().encode(JSON.stringify(spec)));
      return {
        serves: [{ capture: c.id, rep }],
        argv: [python, '-m', 'perf_lab_local.run', '--spec', path, '--rep', String(rep), '--out', '/job/out'],
        env: { PYTHONPATH: '/job/in/workload', PYTHONDONTWRITEBYTECODE: '1', PERF_LAB_INDUCTOR_CACHE: '/job/cache/inductor', HOME: '/tmp', USER: 'kiln' },
        mounts: [{ role: 'cache', source: 'perf-lab-cache', target: '/job/cache', ro: false }],
        timeoutSeconds: 900,
      };
    });
  },

  import(out, ctx) {
    const s = out.step.serves[0];
    if (!s) return [];
    const text = (name: string) => {
      const b = out.files.get(name);
      if (!b) return undefined;
      try {
        return JSON.parse(new TextDecoder().decode(b)) as Json;
      } catch {
        return undefined;
      }
    };
    if (out.execution?.refused) return [{ type: 'error', capture: s.capture, rep: s.rep, message: `step refused: ${out.execution.refused}` }];
    const spec = (ctx.captures.get(s.capture)?.input as SamplerInput | undefined)?.spec;
    const tail = out.log.trim().split('\n').slice(-3).join('\n');
    return [samplerEntities({ read: text, rep: s.rep, capture: s.capture, exit: out.execution?.exit ?? null, stderrTail: tail, ...(spec ? { spec } : {}) })];
  },

  lab(c) {
    const input = c.input as SamplerInput;
    return { labId: input.labId, hash: labCaptureHash(input.spec), ref: input.ref };
  },
};

interface TraceEvent {
  ph: string;
  cat?: string;
  name: string;
  ts: number;
  dur?: number;
  tid: number | string;
  args?: Json;
}

const MS = 1e6;

/** Operator → role, so kernel colouring and `.role()` queries mean the same thing for measured runs. */
export function roleOf(op: string): string {
  if (/grid_sampler|gather/.test(op)) return 'encoder.sampling';
  if (/aten::(mul|sum|add|mul_|add_)$/.test(op)) return 'encoder.reduce';
  if (/Compiled Region|CompiledFxGraph/.test(op)) return 'compiled.region';
  if (/aten::(floor|sub|clamp|le|ge|bitwise|__and__|logical|rsub|div|to|copy_|_to_copy|where|lt|gt)/.test(op)) return 'elementwise';
  return 'other';
}

const SPAN_NAME = (name: string) => (name.startsWith('## Call CompiledFxGraph') ? 'compiled graph call' : name);

/**
 * One repetition's output as an observation: Perf Lab's importRepetition (lab-workbench server/importer.ts), with
 * entity ids local to the run (runs.ts gives them their refs) and the run's own fields under `run`. The arm, mode,
 * shape and toolchain come from the manifest run.py wrote (what actually ran); the spec supplies what was declared.
 */
export function samplerEntities(o: { read: (name: string) => Json | undefined; capture: string; rep: number; exit: number | null; stderrTail?: string; spec?: Json }): Extract<Observation, { type: 'entities' }> {
  const entities: Json[] = [];
  const links: { from: string; to: string; rel: string; evidence: string; method?: string }[] = [];
  const ent = (kind: string, id: string, fields: Json): Json => {
    const e = { kind, id, ...fields };
    entities.push(e);
    return e;
  };
  const local = (e: Json) => `${e.kind}:${e.id}`;
  const link = (from: Json, to: Json, rel: string, evidence: string, method: string) => links.push({ from: local(from), to: local(to), rel, evidence, method });

  const manifest = o.read('manifest.json') ?? {};
  const activation = o.read('activation.json') ?? {};
  const quality = o.read('quality.json');
  const spec = o.spec ?? {};
  const wl = (spec.workload ?? {}) as Json;
  const shape = (manifest.shape ?? {}) as Json;
  const mode = String(manifest.mode ?? (spec.collection as Json | undefined)?.mode ?? 'timing');
  const arm = String(manifest.arm ?? spec.arm ?? '');
  const device = String(manifest.device ?? wl.device ?? 'cpu');
  const layout = `Q${shape.queries ?? wl.queries ?? '?'}/${manifest.dtype ?? wl.dtype ?? 'float32'}/${device}`;
  const source = (name: string) => `rep ${o.rep}/${name}`;

  const reasons: string[] = [];
  if (o.exit !== 0) reasons.push(`process exited with ${o.exit}${o.stderrTail ? `: ${o.stderrTail.split('\n').filter(Boolean).pop()}` : ''}`);
  const expect = spec.expect as { expect?: Record<string, unknown>; arm?: string; onMiss?: string } | null | undefined;
  if (expect?.expect && (!expect.arm || expect.arm === arm)) {
    for (const [k, v] of Object.entries(expect.expect)) {
      if (activation[k] !== v && (expect.onMiss ?? 'invalid') === 'invalid') reasons.push(`activation: ${k} ${String(activation[k] ?? 'unknown')} (expected ${String(v)})`);
    }
  }
  const valid = reasons.length === 0;
  const invalidReason = reasons[0];

  const coverage = {
    complete: true,
    trace: { lost: [] as { from: number; to: number; reason: string }[] },
    source: { missing: [] as { code: string; reason: string }[] },
    counters: { unsupported: ['*'] },
    links: { missing: [] as { rel: string; reason: string; count: number }[] },
  };
  let requests = 0;
  let durationS: number | null = null;

  // ── timing / cpu: one request entity per measured call ────────────────────────────────
  const timing = o.read('timing.json');
  if (timing && (mode === 'timing' || mode === 'cpu')) {
    for (const r of timing.requests as Json[]) {
      const latency = (r.end_ns - r.start_ns) / MS;
      ent('request', `r${o.rep}-${String(r.i).padStart(3, '0')}`, {
        t: r.start_ns / 1e9, tEnd: r.end_ns / 1e9, start: r.start_ns, end: r.end_ns, latency, timeInSystem: latency,
        cpuTime: r.cpu_ns / MS, outcome: 'ok', batch: r.i, layout, warm: true, runValid: valid, invalidReason,
      });
    }
    requests = timing.requests.length;
    const last = (timing.requests as Json[]).at(-1);
    durationS = last ? last.end_ns / 1e9 : 0;
  }
  const cpu = o.read('cpu.json');
  if (cpu) {
    const d = cpu.delta as Json;
    const src = { scope: String(cpu.scope), source: source('cpu.json'), method: 'getrusage(RUSAGE_SELF)' };
    ent('instant', 'rusage', {
      type: 'rusage', t: 0,
      userTime: observed(d.ru_utime * 1000, { unit: 'ms', ...src }),
      systemTime: observed(d.ru_stime * 1000, { unit: 'ms', ...src }),
      voluntaryCtxSwitches: observed(d.ru_nvcsw, { unit: 'count', ...src }),
      involuntaryCtxSwitches: observed(d.ru_nivcsw, { unit: 'count', ...src }),
      minorFaults: observed(d.ru_minflt, { unit: 'count', ...src }),
      majorFaults: observed(d.ru_majflt, { unit: 'count', ...src }),
      maxRss: observed(cpu.maxrss_bytes, { unit: 'B', ...src, scope: 'process lifetime' }),
      window: observed(cpu.window_ns / MS, { unit: 'ms', ...src }),
    });
  }

  // ── trace / memory: requests, ranges and outermost ATen operators from torch.profiler ───
  const trace = o.read('trace.json');
  if (trace && (mode === 'trace' || mode === 'memory')) {
    const events = ((Array.isArray(trace) ? trace : trace.traceEvents) as TraceEvent[]).filter((e) => e && typeof e.ts === 'number');
    const xs = events.filter((e) => e.ph === 'X' && typeof e.dur === 'number');
    const t0 = Math.min(...xs.map((e) => e.ts));
    const ns = (us: number) => Math.round((us - t0) * 1000);
    const reqEvents = xs.filter((e) => e.cat === 'user_annotation' && /^request#\d+$/.test(e.name)).sort((a, b) => a.ts - b.ts);
    const mainTid = reqEvents[0]?.tid;
    const laneOf = (tid: TraceEvent['tid']) => (tid === mainTid ? 'cpu:main' : `cpu:thread ${tid}`);
    const contains = (outer: TraceEvent, inner: TraceEvent) => inner.ts >= outer.ts && inner.ts + (inner.dur ?? 0) <= outer.ts + (outer.dur ?? 0) + 1e-3;

    const reqs = reqEvents.map((e) => {
      const i = Number(e.name.split('#')[1]);
      const start = ns(e.ts);
      const end = ns(e.ts + (e.dur ?? 0));
      return {
        ev: e,
        ent: ent('request', `r${o.rep}-${String(i).padStart(3, '0')}`, {
          start, end, t: start / 1e9, tEnd: end / 1e9, latency: (end - start) / MS, timeInSystem: (end - start) / MS,
          outcome: 'ok', batch: i, layout, warm: true, runValid: valid, invalidReason,
        }),
      };
    });
    const requestOf = (e: TraceEvent) => reqs.find((r) => r.ev.tid === e.tid && contains(r.ev, e)) ?? reqs.find((r) => e.ts >= r.ev.ts && e.ts <= r.ev.ts + (r.ev.dur ?? 0));

    const ranges = xs.filter((e) => e.cat === 'user_annotation' && !/^request#\d+$/.test(e.name));
    const spans = ranges.map((e, k) => {
      const req = requestOf(e);
      const s = ent('span', `${req?.ent.id ?? 'x'}-${SPAN_NAME(e.name).replace(/\s+/g, '_')}-${k}`, {
        name: SPAN_NAME(e.name), lane: laneOf(e.tid), start: ns(e.ts), end: ns(e.ts + (e.dur ?? 0)), dur: (e.dur ?? 0) / 1000, request: req?.ent.id,
      });
      if (req) link(req.ent, s, 'contains', 'direct', 'record_function nesting');
      return { ev: e, ent: s };
    });

    const ops = xs.filter((e) => e.cat === 'cpu_op');
    const outermost = ops.filter((op) => !ops.some((x) => x !== op && x.tid === op.tid && contains(x, op) && (x.dur ?? 0) > (op.dur ?? 0)));
    const codes = new Set<string>();
    outermost.forEach((op, k) => {
      const req = requestOf(op);
      const parent = spans.filter((s) => s.ev.tid === op.tid && contains(s.ev, op)).sort((a, b) => (a.ev.dur ?? 0) - (b.ev.dur ?? 0))[0];
      const dims = op.args?.['Input Dims'];
      const kern = ent('kernel', `${req?.ent.id ?? 'x'}-k${String(k).padStart(4, '0')}`, {
        name: op.name, role: roleOf(op.name), op: op.name, lane: laneOf(op.tid), start: ns(op.ts), end: ns(op.ts + (op.dur ?? 0)), dur: (op.dur ?? 0) / 1000,
        request: req?.ent.id, layout, warm: true, device: 'cpu', shapes: dims ? JSON.stringify(dims) : undefined, selected: false,
      });
      if (parent) link(parent.ent, kern, 'launches', 'direct', 'torch.profiler nesting');
      else if (req) link(req.ent, kern, 'contains', 'direct', 'torch.profiler nesting');
      if (!codes.has(op.name)) {
        codes.add(op.name);
        coverage.source.missing.push({ code: op.name, reason: 'ATen CPU kernel; source mapping not collected' });
      }
    });
    if (device === 'mps') coverage.links.missing.push({ rel: 'launches', reason: 'Metal kernels are not visible to torch.profiler', count: reqs.length });
    requests = reqs.length;
    durationS = reqs.length ? (reqs[reqs.length - 1]!.ent.end as number) / 1e9 : 0;

    // ── memory: allocator blocks from profile_memory, paired by address ────────────────
    if (mode === 'memory') {
      const mem = events.filter((e) => e.name === '[memory]').sort((a, b) => a.ts - b.ts);
      const open = new Map<string, Json>();
      let n = 0;
      let peak = 0;
      for (const e of mem) {
        const bytes = Number(e.args?.Bytes ?? 0);
        const addr = String(e.args?.Addr ?? '');
        peak = Math.max(peak, Number(e.args?.['Total Allocated'] ?? 0));
        if (bytes > 0) {
          const op = ops.filter((x) => x.tid === e.tid && e.ts >= x.ts && e.ts <= x.ts + (x.dur ?? 0)).sort((a, b) => (a.dur ?? 0) - (b.dur ?? 0))[0];
          const range = ranges.filter((r) => r.tid === e.tid && e.ts >= r.ts && e.ts <= r.ts + (r.dur ?? 0)).sort((a, b) => (a.dur ?? 0) - (b.dur ?? 0))[0];
          const req = reqs.find((r) => e.ts >= r.ev.ts && e.ts <= r.ev.ts + (r.ev.dur ?? 0));
          const a = ent('alloc', `a${String(n++).padStart(4, '0')}`, {
            name: `${bytes >= 1 << 20 ? `${(bytes / 2 ** 20).toFixed(1)} MiB` : `${bytes} B`} in ${op?.name ?? range?.name ?? 'unattributed'}`,
            bytes, requested: bytes, scope: 'allocator', pool: device === 'cpu' ? 'c10 CPU allocator' : String(e.args?.['Device Type'] ?? 'device'),
            start: ns(e.ts), end: null, allocatedIn: op?.name ?? null, range: range ? SPAN_NAME(range.name) : null, request: req?.ent.id ?? null,
            retainedBy: null, lifetime: 'live at end of trace', address: addr, totalAfter: Number(e.args?.['Total Allocated'] ?? 0), source: source('trace.json'),
          });
          open.set(addr, a);
        } else if (bytes < 0) {
          const a = open.get(addr);
          if (a) {
            a.end = ns(e.ts);
            a.lifetime = `${(((a.end as number) - (a.start as number)) / MS).toFixed(3)} ms`;
            open.delete(addr);
          }
        }
      }
      const memJson = o.read('memory.json');
      const allocs = entities.filter((x) => x.kind === 'alloc');
      for (const t of (memJson?.ledger ?? []) as Json[]) {
        const tensor = ent('tensor', String(t.name), {
          name: t.name, role: t.role, shape: t.shape, dtype: t.dtype, numel: t.numel, bytes: t.bytes, device: t.device, lifetime: t.lifetime, storage: `S-${t.name}`,
        });
        // the block of the tensor's size, allocated in the range that creates it during the first request:
        // matched by size, range and request rather than by address, so the link is derived, not direct.
        // Request inputs are allocated before profiling starts and have no block in the trace.
        const block = t.range ? allocs.find((a) => a.bytes === t.bytes && a.range === t.range && a.request === reqs[0]?.ent.id) : undefined;
        if (block) link(tensor, block, 'aliases', 'derived', 'size, range and request match');
      }
      ent('instant', 'allocator-peak', {
        type: 'allocator.peak', t: 0,
        peakAllocated: observed(peak, { unit: 'B', scope: 'allocator', source: source('trace.json'), method: 'torch.profiler profile_memory' }),
      });
    }
  }

  const declaredGate = Boolean(spec.quality_gate_sha256);
  const comparison = (spec.comparison ?? {}) as Json;
  const run: Json = {
    rev: comparison.arm_revision ?? null,
    manifest: {
      workload: wl.adapter ?? null,
      boundary: manifest.boundary ?? wl.boundary ?? null,
      fixtures: `seeded inputs (seed ${wl.seed ?? 20261012})`,
      precision: manifest.dtype ?? wl.dtype ?? null,
      inputSize: shape.queries ? `Q ${shape.queries} · H ${shape.heads} · C ${shape.channels} · P ${shape.points} · ${shape.spatial}²` : null,
      revision: comparison.arm_revision ?? null,
      arm,
      mode,
      state: spec.state ?? null,
      gate: declaredGate ? `sha256:${String(spec.quality_gate_sha256)}` : null,
      toolchain: manifest.torch ? `torch ${manifest.torch} · python ${manifest.python} · numpy ${manifest.numpy}` : missing('no manifest written'),
      device,
      threads: manifest.threads ?? null,
      impl: manifest.impl ?? null,
      workloadSha256: manifest.workload_sha256 ?? null,
      gitRevision: manifest.git_revision ?? null,
      platform: manifest.platform ?? null,
      specHash: labCaptureHash(spec),
      synthetic: false,
    },
    validity: { ok: valid, reasons },
    activation,
    quality: {
      gate: declaredGate ? 'declared' : 'none',
      status: declaredGate && quality?.pass && valid ? 'qualified' : 'unqualified',
      maxAbsDiff: quality?.maxAbsDiff ?? null,
      tolerance: quality?.tolerance ?? null,
      reference: quality?.reference ?? null,
    },
    coverage: { ...coverage, complete: coverage.trace.lost.length === 0 && coverage.links.missing.length === 0 },
    clock: mode === 'timing' || mode === 'cpu' ? 'time.perf_counter_ns (process)' : 'torch.profiler (CPU, µs)',
    startedAt: manifest.started_at ?? null,
    durationS,
    requests,
  };
  return { type: 'entities', capture: o.capture, rep: o.rep, entities, links, run };
}
