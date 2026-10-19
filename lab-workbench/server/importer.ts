import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EntityKind, Link } from '../src/lang/rows';
import { missing, val } from '../src/lang/values';

export interface RawEntity {
  kind: EntityKind;
  id: string;
  ref: string;
  run: string;
  [k: string]: unknown;
}

/** Same shape as a generated synthetic run, so queries, views and handles need no second code path. */
export interface Bundle {
  run: RawEntity;
  entities: RawEntity[];
  links: Link[];
}

export interface ImportInput {
  dir: string;
  spec: Record<string, unknown>;
  hash: string;
  /** experiment/arm/mode */
  ref: string;
  rep: number;
  host: string;
  exitCode: number | null;
  stderrTail?: string;
}

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

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

const readJson = (dir: string, name: string): Json | undefined => {
  const p = join(dir, name);
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as Json) : undefined;
};

/** Operator → role, so kernel colouring and `.role()` queries mean the same thing for measured runs. */
export function roleOf(op: string): string {
  if (/grid_sampler|gather/.test(op)) return 'encoder.sampling';
  if (/aten::(mul|sum|add|mul_|add_)$/.test(op)) return 'encoder.reduce';
  if (/Compiled Region|CompiledFxGraph/.test(op)) return 'compiled.region';
  if (/aten::(floor|sub|clamp|le|ge|bitwise|__and__|logical|rsub|div|to|copy_|_to_copy|where|lt|gt)/.test(op)) return 'elementwise';
  return 'other';
}

const SPAN_NAME = (name: string) => (name.startsWith('## Call CompiledFxGraph') ? 'compiled graph call' : name);

export function importRepetition(inp: ImportInput): Bundle {
  const runRef = `${inp.ref}#${inp.rep}`;
  const [experiment, arm, mode] = inp.ref.split('/');
  const entities: RawEntity[] = [];
  const links: Link[] = [];
  const ent = (kind: EntityKind, id: string, fields: Json): RawEntity => {
    const e: RawEntity = { kind, id, ref: `${runRef}!${kind}:${id}`, run: runRef, arm, rep: inp.rep, ...fields };
    entities.push(e);
    return e;
  };
  const link = (from: RawEntity, to: RawEntity, rel: string, evidence: Link['evidence'], method: string) =>
    links.push({ from: from.ref, to: to.ref, rel, evidence, method });

  const spec = inp.spec as Json;
  const wl = (spec.workload ?? {}) as Json;
  const manifest = readJson(inp.dir, 'manifest.json') ?? {};
  const activation = readJson(inp.dir, 'activation.json') ?? {};
  const quality = readJson(inp.dir, 'quality.json');
  const shape = (manifest.shape ?? {}) as Json;
  const device = String(manifest.device ?? wl.device ?? 'cpu');
  const layout = `Q${shape.queries ?? wl.queries ?? '?'}/${manifest.dtype ?? wl.dtype ?? 'float32'}/${device}`;

  const reasons: string[] = [];
  if (inp.exitCode !== 0) reasons.push(`process exited with ${inp.exitCode}${inp.stderrTail ? `: ${inp.stderrTail.split('\n').filter(Boolean).pop()}` : ''}`);
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
  const timing = readJson(inp.dir, 'timing.json');
  if (timing && (mode === 'timing' || mode === 'cpu')) {
    for (const r of timing.requests as Json[]) {
      const latency = (r.end_ns - r.start_ns) / MS;
      ent('request', `r${inp.rep}-${String(r.i).padStart(3, '0')}`, {
        t: r.start_ns / 1e9, tEnd: r.end_ns / 1e9, start: r.start_ns, end: r.end_ns, latency, timeInSystem: latency,
        cpuTime: r.cpu_ns / MS, outcome: 'ok', batch: r.i, layout, warm: true, runValid: valid, invalidReason,
      });
    }
    requests = timing.requests.length;
    const last = (timing.requests as Json[]).at(-1);
    durationS = last ? last.end_ns / 1e9 : 0;
  }
  const cpu = readJson(inp.dir, 'cpu.json');
  if (cpu) {
    const d = cpu.delta as Json;
    const src = { scope: String(cpu.scope), source: `${runRef}/cpu.json`, method: 'getrusage(RUSAGE_SELF)' };
    ent('instant', 'rusage', {
      type: 'rusage', t: 0,
      userTime: val(d.ru_utime * 1000, { unit: 'ms', ...src }),
      systemTime: val(d.ru_stime * 1000, { unit: 'ms', ...src }),
      voluntaryCtxSwitches: val(d.ru_nvcsw, { unit: 'count', ...src }),
      involuntaryCtxSwitches: val(d.ru_nivcsw, { unit: 'count', ...src }),
      minorFaults: val(d.ru_minflt, { unit: 'count', ...src }),
      majorFaults: val(d.ru_majflt, { unit: 'count', ...src }),
      maxRss: val(cpu.maxrss_bytes, { unit: 'B', ...src, scope: 'process lifetime' }),
      window: val(cpu.window_ns / MS, { unit: 'ms', ...src }),
    });
  }

  // ── trace / memory: requests, ranges and outermost ATen operators from torch.profiler ───
  const trace = readJson(inp.dir, 'trace.json');
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
        ent: ent('request', `r${inp.rep}-${String(i).padStart(3, '0')}`, {
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
    const outermost = ops.filter((op) => !ops.some((o) => o !== op && o.tid === op.tid && contains(o, op) && (o.dur ?? 0) > (op.dur ?? 0)));
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
    durationS = reqs.length ? reqs[reqs.length - 1].ent.end as number / 1e9 : 0;

    // ── memory: allocator blocks from profile_memory, paired by address ────────────────
    if (mode === 'memory') {
      const mem = events.filter((e) => e.name === '[memory]').sort((a, b) => a.ts - b.ts);
      const open = new Map<string, RawEntity>();
      let n = 0;
      let peak = 0;
      for (const e of mem) {
        const bytes = Number(e.args?.Bytes ?? 0);
        const addr = String(e.args?.Addr ?? '');
        peak = Math.max(peak, Number(e.args?.['Total Allocated'] ?? 0));
        if (bytes > 0) {
          const op = ops.filter((o) => o.tid === e.tid && e.ts >= o.ts && e.ts <= o.ts + (o.dur ?? 0)).sort((a, b) => (a.dur ?? 0) - (b.dur ?? 0))[0];
          const range = ranges.filter((r) => r.tid === e.tid && e.ts >= r.ts && e.ts <= r.ts + (r.dur ?? 0)).sort((a, b) => (a.dur ?? 0) - (b.dur ?? 0))[0];
          const req = reqs.find((r) => e.ts >= r.ev.ts && e.ts <= r.ev.ts + (r.ev.dur ?? 0));
          const a = ent('alloc', `a${String(n++).padStart(4, '0')}`, {
            name: `${bytes >= 1 << 20 ? `${(bytes / 2 ** 20).toFixed(1)} MiB` : `${bytes} B`} in ${op?.name ?? range?.name ?? 'unattributed'}`,
            bytes, requested: bytes, scope: 'allocator', pool: device === 'cpu' ? 'c10 CPU allocator' : String(e.args?.['Device Type'] ?? 'device'),
            start: ns(e.ts), end: null, allocatedIn: op?.name ?? null, range: range ? SPAN_NAME(range.name) : null, request: req?.ent.id ?? null,
            retainedBy: null, lifetime: 'live at end of trace', address: addr, totalAfter: Number(e.args?.['Total Allocated'] ?? 0), source: `${runRef}/trace.json`,
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
      const memJson = readJson(inp.dir, 'memory.json');
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
      Object.assign(ent('instant', 'allocator-peak', { type: 'allocator.peak', t: 0 }), {
        peakAllocated: val(peak, { unit: 'B', scope: 'allocator', source: `${runRef}/trace.json`, method: 'torch.profiler profile_memory' }),
      });
    }
  }

  const declaredGate = Boolean(spec.quality_gate_sha256);
  const run: RawEntity = {
    kind: 'run', id: runRef, ref: runRef, run: runRef, experiment, arm, mode, rep: inp.rep, specHash: inp.hash, host: inp.host,
    rev: (spec.comparison as Json | undefined)?.arm_revision ?? null, workload: wl.adapter ?? 'unknown',
    manifest: {
      workload: wl.adapter ?? null,
      boundary: manifest.boundary ?? wl.boundary ?? null,
      fixtures: `seeded inputs (seed ${wl.seed ?? 20261012})`,
      precision: manifest.dtype ?? wl.dtype ?? null,
      inputSize: shape.queries ? `Q ${shape.queries} · H ${shape.heads} · C ${shape.channels} · P ${shape.points} · ${shape.spatial}²` : null,
      host: inp.host,
      revision: (spec.comparison as Json | undefined)?.arm_revision ?? null,
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
      specHash: inp.hash,
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
    synthetic: false,
    measured: true,
  };
  return { run, entities, links };
}
