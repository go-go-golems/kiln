import { isAlgo } from './algo';
import {
  isLab,
  SubRecorder,
  type ArmB,
  type BoardB,
  type CaptureB,
  type ExperimentB,
  type LabB,
  type ParamSlot,
  type ViewB,
  isView,
} from './builders';
import { isCompare } from './compare';
import type { BuildEnv, CaptureInstance, DatasetInfo } from './env';
import type { BoardSummary, BuildFailure, IR, IREdge, IRNode, LintItem, ParamSummary, PassRecord } from './ir';
import { createLibrary } from './library';
import { checkParam, isParamSpec, literalOptions, normalizeOptions, implicitDefault, type ParamSpec } from './params';
import { isQuery, type Query } from './query';
import { isLive, isParamRef, isSignalRef, strongest, type Binding, type LiveFn } from './refs';
import { isEnt, rows } from './rows';
import {
  instancesForPattern,
  makeDollar,
  paramValue,
  patternExperiments,
  queryEnv,
  readDerive,
  type BuildRegistry,
  type ParamRuntime,
  type ResolvedArm,
  type ResolvedExperiment,
  type RuntimeState,
  type Tracker,
} from './runtime';
import { globToRegExp, hash, nextId, stableStringify } from './util';

export type Patch = { id: string; label: string; apply: (lab: LabB) => void };

export interface BuildInput {
  source: string;
  labId: string;
  params: Record<string, unknown>;
  signals?: Record<string, unknown>;
  patches?: Patch[];
  env: BuildEnv;
  /** Treat every capture as already imported (used once per lab to seed the synthetic artifact store). */
  seedMode?: boolean;
}

export interface BuildOutput {
  ir: IR;
  registry: BuildRegistry;
}

export class BuildError extends Error {
  constructor(readonly failure: BuildFailure) {
    super(failure.message);
    this.name = 'BuildError';
  }
}

class NeedsEvidence extends Error {
  constructor(readonly mode: string) {
    super(`needs evidence from ${mode}`);
  }
}

/** Line offset of user code inside the function `new Function` synthesizes (header + "use strict" line). */
const LINE_OFFSET = 3;

export function evaluateProgram(source: string): LabB {
  const lib = createLibrary() as unknown as Record<string, unknown>;
  const names = Object.keys(lib);
  let fn: (...a: unknown[]) => unknown;
  try {
    fn = new Function(...names, `"use strict";\n${source}\n//# sourceURL=lab.js`) as (...a: unknown[]) => unknown;
  } catch (e) {
    throw new BuildError({ message: `${(e as Error).name}: ${(e as Error).message}` });
  }
  let result: unknown;
  try {
    result = fn(...names.map((n) => lib[n]));
  } catch (e) {
    const err = e as Error;
    const m = /lab\.js:(\d+):(\d+)/.exec(err.stack ?? '');
    throw new BuildError({
      message: `${err.name}: ${err.message}`,
      line: m ? Number(m[1]) - LINE_OFFSET : undefined,
      column: m ? Number(m[2]) : undefined,
      stack: err.stack,
    });
  }
  if (!isLab(result)) throw new BuildError({ message: 'lab.js must end with `return lab(…)`' });
  return result;
}

const isOpaque = (v: object) =>
  '__estimator' in v || '__query' in v || '__compare' in v || '__view' in v || '__algo' in v || '__matcher' in v || '__lab' in v;

const toJsonSafe = (v: unknown, depth = 0): unknown => {
  if (depth > 6) return '…';
  if (typeof v === 'function') return `ƒ ${String(v).slice(0, 80)}`;
  if (v instanceof RegExp) return String(v);
  if (isEnt(v)) return { ref: v.ref, name: v.name ?? v.id };
  if (isParamRef(v)) return `param:${v.urlKey}`;
  if (isLive(v)) return 'live(ƒ)';
  if (isQuery(v)) return v.describe();
  if (Array.isArray(v)) return v.map((x) => toJsonSafe(x, depth + 1));
  if (v && typeof v === 'object') {
    if ('__estimator' in v) return (v as unknown as { describe: () => string }).describe();
    if (isOpaque(v)) return `[${Object.keys(v).find((k) => k.startsWith('__'))?.slice(2)}]`;
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toJsonSafe(x, depth + 1)]));
  }
  return v;
};

const durationMs = (d: unknown): number | undefined => {
  if (d === undefined || d === null) return undefined;
  const m = /^([\d.]+)\s*(ms|s|m)?$/.exec(String(d));
  if (!m) return undefined;
  const n = Number(m[1]);
  return m[2] === 's' ? n * 1000 : m[2] === 'm' ? n * 60000 : n;
};

export type ImageSelection = 'all' | 'stratified' | 'negatives' | number | number[];

/** Resolves an image selection against a dataset into sorted image ids. */
export function selectImages(info: DatasetInfo, sel: ImageSelection): number[] {
  const all = info.images.map((i) => i.imageId).sort((a, b) => a - b);
  if (sel === 'all') return all;
  if (sel === 'negatives') return info.images.filter((i) => i.negative).map((i) => i.imageId).sort((a, b) => a - b);
  if (sel === 'stratified') {
    // the first image of each category × size stratum, in the provenance's order, and the first negative
    const picks = [...(info.provenance.strata ?? []).map((s) => s.image_ids[0]), (info.provenance.negative_ids ?? [])[0]];
    return [...new Set(picks.filter((x): x is number => typeof x === 'number'))].sort((a, b) => a - b);
  }
  if (typeof sel === 'number') {
    if (!Number.isInteger(sel) || sel < 1) throw new Error(`a count of images must be a positive integer, got ${sel}`);
    return all.slice(0, sel);
  }
  if (Array.isArray(sel)) {
    const known = new Set(all);
    const unknown = sel.filter((x) => !known.has(Number(x)));
    if (unknown.length) throw new Error(`images ${unknown.slice(0, 5).join(', ')} are not in dataset ${info.id.slice(0, 12)}…`);
    return [...new Set(sel.map(Number))].sort((a, b) => a - b);
  }
  throw new Error(`unknown image selection ${JSON.stringify(sel)}; use 'all', 'stratified', 'negatives', a count or a list of ids`);
}

export function build(input: BuildInput): BuildOutput {
  const t0 = performance.now();
  const passes: PassRecord[] = [];
  const lint: LintItem[] = [];
  const nodes: IRNode[] = [];
  const edges: IREdge[] = [];
  const nodeIds = new Set<string>();
  const addNode = (n: IRNode) => {
    if (nodeIds.has(n.id)) return;
    nodeIds.add(n.id);
    nodes.push(n);
  };
  const addEdge = (from: string, to: string, kind: IREdge['kind']) => edges.push({ from, to, kind });
  const pass = <T>(name: string, fn: () => T, detail: (r: T) => string): T => {
    const a = performance.now();
    const r = fn();
    passes.push({ n: passes.length + 1, name, detail: detail(r), ms: +(performance.now() - a).toFixed(2) });
    return r;
  };
  const env = input.env;
  const isAvailable = (h: string) => Boolean(input.seedMode) || env.isAvailable(h);

  // ── 01 structure ────────────────────────────────────────────────────────────
  const lab = pass(
    'structure',
    () => {
      const l = evaluateProgram(input.source);
      for (const p of input.patches ?? []) p.apply(l);
      return l;
    },
    (l) =>
      `${l.experiments.length} experiments · ${l.boards.length} boards · ${l.derives.length} derives · ${l.params.length + l.experiments.reduce((a, e) => a + e.params.length, 0) + l.boards.reduce((a, b) => a + b.params.length, 0)} params`,
  );

  const buildId = nextId('build-');
  const registry: BuildRegistry = {
    buildId,
    labId: input.labId,
    lab,
    ir: undefined as unknown as IR,
    experiments: new Map(),
    instances: [],
    boards: new Map(lab.boards.map((b) => [b.id, b])),
    derives: new Map(lab.derives.map((d) => [d.name, d])),
    hypotheses: new Map(lab.hypotheses.map((h) => [h.id, h])),
    params: new Map(),
    source: env.makeSource([], () => false),
    deriveReads: new Map(),
    deriveCache: new Map(),
    lambdaSources: new Map(),
  };

  // Parameters are registered before anything resolves so plan lambdas can read them.
  const slots: ParamSlot[] = [...lab.params, ...lab.experiments.flatMap((e) => e.params), ...lab.boards.flatMap((b) => b.params)];
  const reads: { param: string; reader: string; phase: Binding }[] = [];
  for (const s of slots) {
    if (registry.params.has(s.key)) {
      lint.push({ level: 'error', code: 'param-duplicate', message: `parameter ${s.urlKey} is declared twice`, node: `param:${s.key}` });
      continue;
    }
    const spec = s.spec;
    const opts = literalOptions(spec);
    const summary: ParamSummary = {
      key: s.key,
      urlKey: s.urlKey,
      name: s.name,
      scope: s.scope,
      owner: s.owner,
      control: spec.control,
      label: spec.m.label ?? s.name,
      help: spec.m.help,
      unit: spec.unitLabel,
      group: spec.m.group,
      order: spec.m.order ?? s.order,
      defaultValue: undefined,
      options: opts,
      optionsPhase: spec.control === 'pickRun' ? 'runs' : spec.c.options === undefined ? 'none' : opts ? 'literal' : 'plan',
      constraints: {
        min: spec.c.min,
        max: spec.c.max,
        step: spec.c.step,
        scale: spec.c.scale,
        pattern: spec.c.pattern,
        maxLength: spec.c.maxLength,
        placeholder: spec.c.placeholder,
        runPattern: spec.c.runPattern,
      },
      binding: 'view',
      readers: [],
      confirm: spec.m.confirm,
      affects: spec.m.affects,
      urlEnabled: spec.m.url !== false,
    };
    registry.params.set(s.key, { slot: s, summary });
  }

  const state: RuntimeState = { params: input.params, signals: input.signals ?? {} };
  const paramKeyFor = (nameOrRef: unknown, expId?: string): string => {
    if (isParamRef(nameOrRef)) return nameOrRef.key;
    const n = String(nameOrRef);
    if (registry.params.has(n)) return n;
    if (expId && registry.params.has(`${expId}.${n}`)) return `${expId}.${n}`;
    for (const p of registry.params.values()) if (p.slot.name === n && p.slot.scope === 'lab') return p.slot.key;
    for (const p of registry.params.values()) if (p.slot.urlKey === n || p.slot.name === n) return p.slot.key;
    throw new Error(`unknown parameter "${n}"`);
  };

  // ── 02 expand · 03 resolve ──────────────────────────────────────────────────
  const instances: CaptureInstance[] = [];
  const deferred: { exp: ExperimentB; resolved: ResolvedExperiment; arm: ResolvedArm; cap: CaptureB; mode: string }[] = [];
  let planLambdas = 0;

  const makeCtx = (
    readerId: string,
    exp: ExperimentB | undefined,
    host: string | undefined,
    adapterName: string | undefined,
    extra: Record<string, unknown> = {},
    evidence?: (mode: string) => unknown,
  ) => ({
    param: (n: unknown) => {
      const key = paramKeyFor(n, exp?.id);
      reads.push({ param: key, reader: readerId, phase: 'plan' });
      return paramValue(registry, key, state);
    },
    data: (n: string) => lab.dataMap[n],
    /** a registered dataset (dataset('…') or its hash); undefined when the server does not hold it */
    dataset: (d: unknown) => env.dataset?.(typeof d === 'object' && d !== null ? String((d as { sha256?: unknown }).sha256) : String(d)),
    get capabilities() {
      if (!host) throw new Error('ctx.capabilities is not available before the host is resolved');
      return env.capabilities(host);
    },
    get adapter() {
      if (!adapterName) throw new Error('ctx.adapter needs a workload');
      return env.adapter(adapterName);
    },
    host,
    evidence: evidence ?? ((mode: string) => {
      throw new NeedsEvidence(mode);
    }),
    ...extra,
  });

  const resolveDeep = (v: unknown, ctx: ReturnType<typeof makeCtx>, readerId: string, depth = 0): unknown => {
    if (depth > 8) return v;
    if (typeof v === 'function') {
      planLambdas++;
      registry.lambdaSources.set(`${readerId}#${planLambdas}`, String(v));
      return resolveDeep((v as (c: unknown) => unknown)(ctx), ctx, readerId, depth + 1);
    }
    if (isParamRef(v)) return ctx.param(v);
    if (isLive(v)) {
      lint.push({ level: 'error', code: 'live-in-plan-slot', message: `a live($ => …) lambda cannot be used in plan slot ${readerId}`, node: readerId });
      return null;
    }
    if (Array.isArray(v)) return v.map((x) => resolveDeep(x, ctx, readerId, depth + 1));
    if (v instanceof RegExp || v === null || typeof v !== 'object') return v;
    if (isEnt(v)) return { ref: v.ref, name: v.name ?? v.id };
    if (isOpaque(v)) return v;
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolveDeep(x, ctx, readerId, depth + 1)]));
  };

  const resolved = pass(
    'expand · resolve',
    () => {
      // lab-level parameter defaults and options may be plan lambdas
      for (const p of registry.params.values()) {
        const spec = p.slot.spec;
        const ctx = makeCtx(`param:${p.slot.key}`, undefined, undefined, undefined);
        if (p.summary.optionsPhase === 'plan') {
          if (typeof spec.c.options === 'function') {
            try {
              p.summary.options = normalizeOptions(resolveDeep(spec.c.options, ctx, `param:${p.slot.key}`));
            } catch (e) {
              lint.push({ level: 'error', code: 'param-options-error', message: `${p.slot.urlKey}: ${(e as Error).message}` });
            }
          } else {
            p.summary.optionsPhase = isLive(spec.c.options) ? 'view' : 'data';
          }
        }
        let def: unknown;
        try {
          def = spec.m.default === undefined ? implicitDefault(spec, p.summary.options) : resolveDeep(spec.m.default, ctx, `param:${p.slot.key}`);
        } catch (e) {
          lint.push({ level: 'error', code: 'param-default-error', message: `${p.slot.urlKey}: ${(e as Error).message}` });
        }
        p.summary.defaultValue = def ?? null;
      }

      for (const exp of lab.experiments) {
        const expNode = `experiment:${exp.id}`;
        const one = (name: string) => exp.props[name]?.[0];
        const baseCtx = makeCtx(`${expNode}/host`, exp, undefined, undefined);
        let host: string;
        try {
          host = String(resolveDeep(one('host') ?? 'playback@dgx', baseCtx, `${expNode}/host`));
        } catch (e) {
          lint.push({ level: 'error', code: 'resolve-error', message: `${exp.id}.host: ${(e as Error).message}`, node: expNode });
          host = 'playback@dgx';
        }
        const workloadRaw = one('workload') as { adapter?: string; opts?: Record<string, unknown> } | undefined;
        const adapterName = workloadRaw?.adapter;
        const ctx = (readerId: string, extra: Record<string, unknown> = {}) => makeCtx(readerId, exp, host, adapterName, extra);
        const safe = <T>(slot: string, f: () => T, fallback: T): T => {
          try {
            return f();
          } catch (e) {
            lint.push({ level: 'error', code: 'resolve-error', message: `${exp.id}.${slot}: ${(e as Error).message}`, node: expNode });
            return fallback;
          }
        };
        const r = (slot: string) => safe(slot, () => resolveDeep(one(slot), ctx(`${expNode}/${slot}`), `${expNode}/${slot}`), undefined);

        // when-clauses decide skipped cells and limitations
        for (const w of exp.whens) {
          const cond = safe('when', () => resolveDeep(w.cond, ctx(`${expNode}/when`, { cell: w.cell }), `${expNode}/when`), false);
          if (cond) {
            exp.currentCell = w.cell;
            w.fn(exp);
            exp.currentCell = undefined;
          }
        }
        const cellKey = (c?: Record<string, unknown>) => (c ? JSON.stringify(c) : '');
        const warmupRaw = one('warmup');
        let warmup: Record<string, unknown> | undefined;
        if (typeof warmupRaw === 'function') {
          const w = new SubRecorder('warmup', new Set(['requests', 'until']));
          (warmupRaw as (x: unknown) => unknown)(w);
          const until = w.props.until?.[0];
          if (typeof until === 'function' || isLive(until)) {
            lint.push({
              level: 'error',
              code: 'lower-runner-slot',
              message: `${exp.id}: warmup.until runs inside perf_lab (Python). Use a declarative predicate such as activation({ replay: 'hit' })`,
              node: expNode,
            });
          }
          warmup = { requests: w.props.requests?.[0], until: typeof until === 'function' ? 'ƒ (rejected)' : (until as { expect?: unknown })?.expect };
        }
        const expectArgs = exp.props.expect;
        const repeat = r('repeat') as ResolvedExperiment['repeat'];
        const phases = (exp.phasesB?.list ?? [])
          .filter((p) => !exp.phasesB?.onlyNames || exp.phasesB.onlyNames.includes(p.name))
          .map((p) => ({ type: p.type, name: p.name, opts: safe('phases', () => resolveDeep(p.opts, ctx(`${expNode}/phases`), `${expNode}/phases`) as Record<string, unknown>, {}) }));
        const workloadOpts = safe('workload', () => resolveDeep(workloadRaw?.opts ?? {}, ctx(`${expNode}/workload`), `${expNode}/workload`) as Record<string, unknown>, {});
        const arms: ResolvedArm[] = exp.arms.map((a: ArmB) => {
          const armCtx = ctx(`${expNode}/arm:${a.name}`, { arm: a.name, cell: a.cell });
          const revRaw = safe('arm', () => resolveDeep(a.props.rev?.[0], armCtx, `${expNode}/arm:${a.name}`), undefined) as { sha?: string } | string | undefined;
          const skip = exp.skippedCells.find((s) => cellKey(s.cell) === cellKey(a.cell) && a.cell);
          return {
            name: a.name,
            role: a.role,
            rev: typeof revRaw === 'string' ? revRaw : (revRaw?.sha ?? 'HEAD'),
            switches: safe('switches', () => resolveDeep(a.props.switches?.[0], armCtx, `${expNode}/arm:${a.name}`), undefined),
            corunner: toJsonSafe(a.props.corunner?.[0]),
            pin: a.props.pin?.[0],
            cell: a.cell,
            skipped: skip ? (skip.reason ?? 'skipped') : undefined,
          };
        });
        let evidence: ResolvedExperiment['evidence'];
        const evidenceArgs = exp.props.evidence;
        if (evidenceArgs) {
          const a = safe('evidence', () => resolveDeep(evidenceArgs[0], ctx(`${expNode}/evidence`), `${expNode}/evidence`), undefined) as { __archive?: boolean; sha256?: string; name?: string } | undefined;
          const o = (safe('evidence', () => resolveDeep(evidenceArgs[1] ?? {}, ctx(`${expNode}/evidence`), `${expNode}/evidence`), {}) ?? {}) as { format?: string; reports?: Record<string, string[]> };
          if (!a?.__archive || !/^[0-9a-f]{64}$/.test(a.sha256 ?? ''))
            lint.push({ level: 'error', code: 'evidence-archive', message: `${exp.id}.evidence: expected archive('<sha256 of the .tar.gz>')`, node: expNode });
          else evidence = { archive_sha256: a.sha256!, format: o.format ?? 'detection-qualification/v1', reports: o.reports ?? null, name: a.name };
        }
        const res: ResolvedExperiment = {
          evidence,
          id: exp.id,
          host,
          question: one('question') as string | undefined,
          boundary: r('boundary') as string | undefined,
          workload: { adapter: adapterName ?? 'unknown', opts: workloadOpts },
          state: r('state') as Record<string, unknown> | undefined,
          warmup,
          expect: expectArgs
            ? { expect: (expectArgs[0] as { expect: Record<string, unknown> }).expect, ...((expectArgs[1] as Record<string, unknown>) ?? {}) }
            : undefined,
          gate: r('gate') as Record<string, unknown> | undefined,
          repeat,
          compare: one('compare'),
          phases,
          offer: r('offer') as Record<string, unknown> | undefined,
          admission: r('admission') as Record<string, unknown> | undefined,
          deadline: r('deadline'),
          drain: r('drain'),
          units: exp.props.units,
          purpose: one('purpose') as string | undefined,
          forkOf: exp.forkOf,
          arms,
          limitations: exp.limitations.map((l) => (l.cell ? `${Object.values(l.cell).join(' · ')}: ${l.text}` : l.text)),
        };
        registry.experiments.set(exp.id, res);

        // captures × arms
        for (const arm of arms) {
          if (arm.skipped) continue;
          for (const cap of exp.captures) {
            const mode = cap.mode;
            const capId = `${expNode}/${arm.name}/${mode}`;
            try {
              const opts = resolveCaptureOpts(cap, ctx(capId, { arm: arm.name, cell: arm.cell }), capId);
              instances.push(makeInstance(res, arm, mode, opts, cap, 1));
            } catch (e) {
              if (e instanceof NeedsEvidence) deferred.push({ exp, resolved: res, arm, cap, mode: e.mode });
              else lint.push({ level: 'error', code: 'resolve-error', message: `${capId}: ${(e as Error).message}`, node: capId });
            }
          }
        }
      }

      // stage 2: captures whose plan lambdas read earlier evidence
      const stage1Source = env.makeSource(instances.slice(), (h) => isAvailable(h));
      for (const d of deferred) {
        const capId = `experiment:${d.exp.id}/${d.arm.name}/${d.cap.mode}`;
        const dep = instances.find((i) => i.experiment === d.exp.id && i.arm === d.arm.name && i.mode === d.mode);
        const depRef = `${d.exp.id}/${d.arm.name}/${d.mode}`;
        if (!dep || !isAvailable(dep.hash)) {
          const inst = makeInstance(d.resolved, d.arm, d.cap.mode, { launch: `selected from ${depRef}` }, d.cap, 2);
          inst.status = 'blocked';
          inst.blockedOn = `import:${depRef}`;
          inst.dependsOn = dep?.id;
          instances.push(inst);
          continue;
        }
        const evidence = () => ({
          kernels: () => rows(stage1Source.entities('kernel', `${depRef}#0`)),
          requests: () => rows(stage1Source.entities('request', `${depRef}#0`)),
          spans: () => rows(stage1Source.entities('span', `${depRef}#0`)),
        });
        try {
          const ctx = makeCtx(capId, d.exp, d.resolved.host, d.resolved.workload.adapter, { arm: d.arm.name, cell: d.arm.cell }, evidence);
          const opts = resolveCaptureOpts(d.cap, ctx, capId);
          const inst = makeInstance(d.resolved, d.arm, d.cap.mode, opts, d.cap, 2);
          inst.dependsOn = dep.id;
          instances.push(inst);
        } catch (e) {
          lint.push({ level: 'error', code: 'resolve-error', message: `${capId}: ${(e as Error).message}`, node: capId });
        }
      }
      return { experiments: registry.experiments.size, instances: instances.length, deferred: deferred.length };
    },
    (r) => `${r.experiments} experiments · ${r.instances} capture instances · ${planLambdas} plan lambdas · ${r.deferred} staged`,
  );
  void resolved;

  function resolveCaptureOpts(cap: CaptureB, ctx: ReturnType<typeof makeCtx>, capId: string): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, args] of Object.entries(cap.props)) {
      out[k] = args.length === 1 ? resolveDeep(args[0], ctx, capId) : args.map((a) => resolveDeep(a, ctx, capId));
    }
    if (cap.collector) {
      out.collector = cap.collector.name;
      try {
        out.lowered = toJsonSafe(cap.collector.def.lower?.(cap.collector.props));
      } catch (e) {
        lint.push({ level: 'error', code: 'collector-lower', message: `${capId}: ${(e as Error).message}`, node: capId });
      }
      out.props = toJsonSafe(cap.collector.props);
    }
    return out;
  }

  function makeInstance(
    exp: ResolvedExperiment,
    arm: ResolvedArm,
    mode: string,
    opts: Record<string, unknown>,
    cap: CaptureB,
    stage: number,
  ): CaptureInstance {
    const processes = Number(exp.repeat?.processes ?? 3);
    const reps =
      mode === 'timing' ? processes : mode === 'trace' ? Number(opts.processes ?? 3) : mode === 'memory' && Array.isArray(opts.states) ? opts.states.length : 1;
    const baseline = exp.arms.find((a) => a.role === 'baseline');
    const candidate = exp.arms.find((a) => a.role === 'candidate');
    const lowered = lowerWorkload(exp);
    const spec: Record<string, unknown> = {
      schema_version: 1,
      experiment_id: exp.id,
      arm: arm.name,
      host: exp.host,
      workload: lowered.workload,
      comparison: {
        baseline_revision: baseline?.rev ?? null,
        candidate_revision: candidate?.rev ?? null,
        arm_revision: arm.rev,
        switches: toJsonSafe(arm.switches) ?? null,
        corunner: arm.corunner ?? null,
        paired_order_seed: (exp.repeat?.order as { seed?: number } | undefined)?.seed ?? null,
      },
      state: exp.state ?? null,
      warmup: exp.warmup ?? null,
      expect: exp.expect ?? null,
      phases: toJsonSafe(exp.phases),
      offer: toJsonSafe(exp.offer) ?? null,
      admission: exp.admission ?? null,
      deadline: exp.deadline ?? null,
      repeat: { processes: reps },
      collection: { mode, ...(toJsonSafe(opts) as Record<string, unknown>) },
      quality_gate_sha256: exp.gate ? hash(stableStringify(exp.gate)) : null,
    };
    // only when declared, so the hashes of every capture without evidence are unchanged
    if (exp.evidence) spec.evidence = { archive_sha256: exp.evidence.archive_sha256, format: exp.evidence.format, reports: exp.evidence.reports };
    const h = hash(stableStringify(spec));
    const blockedOn =
      lowered.blockedOn ??
      (exp.evidence
        ? (env.evidenceBlocked?.() ??
          (env.archive?.(exp.evidence.archive_sha256) ? undefined : `evidence:${exp.evidence.archive_sha256.slice(0, 12)}… not registered on the lab server (pnpm lab evidence add <file>)`))
        : undefined);
    const adapter = env.adapter(exp.workload.adapter);
    const requests =
      exp.offer && exp.workload.adapter === 'embedding'
        ? (Number(String((exp.offer as { rate?: unknown }).rate ?? '6').split('/')[0]) || 6) * ((durationMs((exp.offer as { duration?: unknown }).duration) ?? 120000) / 1000)
        : Number(opts.requests ?? 40);
    const factor = { timing: 1, trace: 1.4, memory: 1.8, kernels: 25, cpu: 1.2, sanitizer: 30 }[mode] ?? 1;
    const estimate = (reps * requests * adapter.perRequestMs * factor) / 60000;
    void cap;
    return {
      id: `capture:${exp.id}/${arm.name}/${mode}`,
      experiment: exp.id,
      arm: arm.name,
      armRole: arm.role,
      rev: arm.rev,
      mode,
      ref: `${exp.id}/${arm.name}/${mode}`,
      reps,
      hash: h,
      host: exp.host,
      workload: exp.workload,
      spec,
      stage,
      status: isAvailable(h) ? 'cached' : blockedOn ? 'blocked' : exp.evidence ? 'import' : 'execute',
      blockedOn,
      estimateGpuMin: exp.evidence ? 0 : +estimate.toFixed(2),
    };
  }

  /**
   * The workload part of a capture specification. A dino workload names its dataset by manifest hash and its
   * images by id, resolved from the selection at plan time, so a different subset is a different capture.
   */
  function lowerWorkload(exp: ResolvedExperiment): { workload: Record<string, unknown>; blockedOn?: string } {
    const opts = toJsonSafe(exp.workload.opts) as Record<string, unknown>;
    const ds = exp.workload.opts.dataset as { __dataset?: boolean; sha256?: string } | undefined;
    if (exp.workload.adapter !== 'dino' || !ds?.__dataset || !ds.sha256)
      return { workload: { adapter: exp.workload.adapter, boundary: exp.boundary ?? null, fixture_manifest_sha256: hash(String(exp.workload.opts.fixtures ?? 'none')), ...opts } };
    const { dataset: _dataset, images, ...rest } = opts;
    const info = env.dataset?.(ds.sha256);
    const selection = (images ?? 'all') as ImageSelection;
    let ids: number[] | null = null;
    if (info) {
      try {
        ids = selectImages(info, selection);
      } catch (e) {
        lint.push({ level: 'error', code: 'dataset-images', message: `${exp.id}.workload.images: ${(e as Error).message}`, node: `experiment:${exp.id}` });
      }
    }
    return {
      workload: {
        adapter: 'dino',
        boundary: exp.boundary ?? null,
        fixture_manifest_sha256: ds.sha256,
        dataset_sha256: ds.sha256,
        image_selection: Array.isArray(selection) ? 'explicit' : String(selection),
        image_ids: ids,
        ...rest,
      },
      blockedOn: info ? (ids ? undefined : 'dataset image selection') : `dataset:${ds.sha256.slice(0, 12)}… not registered on the lab server`,
    };
  }

  registry.instances = instances;
  registry.source = env.makeSource(instances, (h) => isAvailable(h));

  // ── 04 trace ────────────────────────────────────────────────────────────────
  const viewReaders: { view: string; board: string; deps: { kind: 'param' | 'signal' | 'derive'; key: string }[] }[] = [];
  let liveCount = 0;
  let traceErrors = 0;
  const boardExperiments = new Map<string, Set<string>>();
  pass(
    'trace',
    () => {
      for (const d of lab.derives) {
        try {
          readDerive(registry, d.name, state);
          for (const key of registry.deriveReads.get(d.name) ?? []) reads.push({ param: key, reader: `derive:${d.name}`, phase: 'data' });
        } catch (e) {
          lint.push({ level: 'error', code: 'derive-error', message: `derive ${d.name}: ${(e as Error).message}`, node: `derive:${d.name}` });
        }
      }
      for (const board of lab.boards) {
        const exps = new Set<string>();
        boardExperiments.set(board.id, exps);
        const visit = (owner: string, x: unknown, depth = 0) => {
          if (depth > 6 || x === null || x === undefined) return;
          const deps: { kind: 'param' | 'signal' | 'derive'; key: string }[] = [];
          const tracker: Tracker = { read: (kind, key) => deps.push({ kind, key }) };
          if (isParamRef(x)) deps.push({ kind: 'param', key: x.key });
          else if (isSignalRef(x)) deps.push({ kind: 'signal', key: x.key });
          else if (isLive(x)) {
            liveCount++;
            registry.lambdaSources.set(x.id, String(x.fn));
            try {
              const $ = makeDollar(registry, state, { tracker });
              const out = (x as LiveFn).fn($);
              visit(owner, out, depth + 1);
              if (isQuery(out)) out.evaluate(queryEnv(registry, state, tracker));
            } catch {
              traceErrors++;
            }
          } else if (isQuery(x)) {
            const q = x as Query;
            const ins = q.inputs();
            for (const p of ins.patterns) {
              patternExperiments(p).forEach((e) => exps.add(e));
              visit(owner, p, depth + 1);
            }
            for (const dn of ins.derives) deps.push({ kind: 'derive', key: dn });
            for (const op of q.ops) for (const a of op.args) if (typeof a !== 'function') visit(owner, a, depth + 1);
          } else if (isCompare(x)) {
            patternExperiments(x.left).forEach((e) => exps.add(e));
            patternExperiments(x.right).forEach((e) => exps.add(e));
            visit(owner, x.left, depth + 1);
            visit(owner, x.right, depth + 1);
          } else if (typeof x === 'string') {
            patternExperiments(x).forEach((e) => exps.add(e));
          } else if (isAlgo(x)) {
            for (const v of Object.values(x.opts)) visit(owner, v, depth + 1);
          } else if (Array.isArray(x)) {
            for (const y of x) visit(owner, y, depth + 1);
          } else if (typeof x === 'object' && !isView(x) && !isOpaque(x as object) && !isEnt(x)) {
            for (const y of Object.values(x as Record<string, unknown>)) visit(owner, y, depth + 1);
          }
          if (deps.length) viewReaders.push({ view: owner, board: board.id, deps });
        };
        visit(`board:${board.id}`, board.titleText);
        visit(`board:${board.id}`, board.subtitleText);
        for (const d of board.derivedSigs) visit(`signal:${d.ref.key}`, d.fn);
        const walk = (v: ViewB) => {
          const owner = `view:${board.id}/${v.name ?? `${v.componentName ?? v.kind}·${v.id.replace('view:', '')}`}`;
          for (const a of v.args) visit(owner, a);
          for (const args of Object.values(v.props)) for (const a of args) visit(owner, a);
          for (const c of v.children) walk(c);
          for (const s of Object.values(v.slots)) walk(s);
          // pickRun parameters bound to this board count as experiments shown here
        };
        board.views.forEach(walk);
        for (const p of board.params) {
          if (p.spec.control === 'pickRun' && p.spec.c.runPattern) patternExperiments(p.spec.c.runPattern).forEach((e) => exps.add(e));
        }
      }
      for (const vr of viewReaders) for (const d of vr.deps) if (d.kind === 'param') reads.push({ param: d.key, reader: vr.view, phase: 'view' });
      // a board that reads a derive shows the experiments behind it (transitively through other derives)
      const deriveExps = new Map<string, Set<string>>();
      const expsOfDerive = (name: string, seen: Set<string> = new Set()): Set<string> => {
        if (deriveExps.has(name)) return deriveExps.get(name)!;
        const out = new Set<string>();
        if (seen.has(name)) return out;
        seen.add(name);
        const collect = (x: unknown) => {
          if (isQuery(x)) {
            for (const p of x.inputs().patterns) patternExperiments(p).forEach((e) => out.add(e));
            for (const dn of x.inputs().derives) expsOfDerive(dn, seen).forEach((e) => out.add(e));
          } else if (isCompare(x)) {
            patternExperiments(x.left).forEach((e) => out.add(e));
            patternExperiments(x.right).forEach((e) => out.add(e));
          } else if (Array.isArray(x)) x.forEach(collect);
        };
        const d = registry.derives.get(name);
        if (d) collect(d.input);
        deriveExps.set(name, out);
        return out;
      };
      for (const vr of viewReaders) {
        for (const d of vr.deps) if (d.kind === 'derive') expsOfDerive(d.key).forEach((e) => boardExperiments.get(vr.board)?.add(e));
      }
      for (const h of lab.hypotheses) {
        if (h.prediction) for (const p of h.prediction.query.inputs().patterns) void p;
      }
      // parameter bindings: strongest reader phase wins
      for (const rd of reads) {
        const p = registry.params.get(rd.param);
        if (!p) continue;
        p.summary.binding = strongest(p.summary.readers.length ? p.summary.binding : undefined, rd.phase);
        if (!p.summary.readers.includes(rd.reader)) p.summary.readers.push(rd.reader);
      }
      return { live: liveCount, derives: lab.derives.length };
    },
    (r) => `${r.live} live lambdas · ${r.derives} derives traced · ${traceErrors} dry-run notes`,
  );

  // ── 05 validate ─────────────────────────────────────────────────────────────
  pass(
    'validate',
    () => {
      const unknownLint = (where: string, set: Set<string>, node?: string) => {
        for (const m of set) lint.push({ level: 'warning', code: 'unknown-method', message: `${where}: unknown method .${m}()`, node });
      };
      unknownLint('lab', lab.unknown);
      for (const exp of lab.experiments) {
        const node = `experiment:${exp.id}`;
        unknownLint(`experiment ${exp.id}`, exp.unknown, node);
        for (const c of exp.captures) unknownLint(`${exp.id} capture.${c.mode}()`, c.unknown, node);
        for (const a of exp.arms) unknownLint(`${exp.id} arm ${a.name}`, a.unknown, node);
        if (!exp.props.gate) lint.push({ level: 'warning', code: 'no-quality-gate', message: `${exp.id}: no quality gate — results will be marked unqualified`, node });
        if (!exp.props.expect && exp.props.workload && (exp.props.workload[0] as { adapter?: string }).adapter === 'dino')
          lint.push({ level: 'warning', code: 'no-activation-rule', message: `${exp.id}: no activation rule — a silent fallback would count as a candidate result`, node });
        if (!exp.props.repeat) lint.push({ level: 'warning', code: 'no-repetition', message: `${exp.id}: no repetition policy — one process per arm cannot support a comparison`, node });
        if (!exp.props.workload) lint.push({ level: 'error', code: 'no-workload', message: `${exp.id}: no workload declared`, node });
        for (const c of exp.captures) {
          if (c.mode === 'kernels' && c.props.cacheControl)
            lint.push({ level: 'info', code: 'counters-not-latency', message: `${exp.id}: kernels capture uses ncu replay and cache control — counter evidence only, never a latency claim`, node });
        }
        // what the host can collect comes from its capability report, not from the program
        const host = registry.experiments.get(exp.id)?.host;
        if (host) {
          try {
            const caps = env.capabilities(host);
            const noCounters = caps.counters.unsupported.includes('*');
            for (const c of exp.captures) {
              if (noCounters && (c.mode === 'kernels' || c.mode === 'sanitizer'))
                lint.push({ level: 'error', code: 'capture-unsupported', message: `${exp.id}: ${host} exposes no hardware counters; capture.${c.mode}() cannot run there`, node });
            }
          } catch (e) {
            lint.push({ level: 'error', code: 'host-unavailable', message: `${exp.id}: ${(e as Error).message}`, node });
          }
        }
        if (exp.forkOf) lint.push({ level: 'info', code: 'fork', message: `${exp.id}: forked from ${exp.forkOf}`, node });
      }
      for (const b of lab.boards) {
        unknownLint(`board ${b.id}`, b.unknown, `board:${b.id}`);
        const names = new Set<string>();
        const collect = (v: ViewB) => {
          if (v.name) names.add(v.name);
          unknownLint(`board ${b.id} ${v.kind}()`, v.unknown, `board:${b.id}`);
          v.children.forEach(collect);
          Object.values(v.slots).forEach(collect);
        };
        b.views.forEach(collect);
        if (b.areas) {
          for (const area of new Set(b.areas.split(/\s+/).filter(Boolean))) {
            if (area !== '.' && !names.has(area)) lint.push({ level: 'warning', code: 'layout-area', message: `board ${b.id}: layout area "${area}" has no view named with .as('${area}')`, node: `board:${b.id}` });
          }
        }
      }
      // parameters
      for (const p of registry.params.values()) {
        const s = p.summary;
        const node = `param:${s.key}`;
        if (s.readers.length === 0) lint.push({ level: 'warning', code: 'param-unused', message: `parameter ${s.urlKey} is declared but never read`, node });
        if (s.defaultValue !== null && s.control !== 'pickRun') {
          const c = checkParam(p.slot.spec, s.defaultValue, s.options);
          if (!c.ok) lint.push({ level: 'error', code: 'param-default-invalid', message: `parameter ${s.urlKey}: default ${JSON.stringify(s.defaultValue)} is invalid (${c.error})`, node });
        }
        if (s.affects && s.affects !== s.binding && s.readers.length)
          lint.push({ level: 'error', code: 'param-affects-mismatch', message: `parameter ${s.urlKey} declares .affects('${s.affects}') but is ${s.binding}-bound`, node });
        if (s.binding === 'plan')
          lint.push({ level: 'info', code: 'param-plan-identity', message: `parameter ${s.urlKey} is plan-bound: each value is a distinct experiment identity`, node });
        if (s.options && s.options.length === 0) lint.push({ level: 'warning', code: 'param-options-empty', message: `parameter ${s.urlKey}: options resolved to an empty list`, node });
      }
      for (const b of lab.boards) {
        for (const bp of b.params) {
          if (lab.params.some((lp) => lp.name === bp.name)) {
            lint.push({ level: 'warning', code: 'param-shadow', message: `board ${b.id}: parameter ${bp.name} shadows a lab parameter`, node: `param:${bp.key}` });
            lint.push({ level: 'error', code: 'param-url-collision', message: `board ${b.id}: URL key "${bp.name}" is used by two parameters`, node: `param:${bp.key}` });
          }
        }
      }
      return lint.length;
    },
    (n) => `${n} findings`,
  );

  // ── 06 lower ────────────────────────────────────────────────────────────────
  const lowered = pass(
    'lower',
    () => instances.map((i) => i.spec),
    (l) => `${l.length} perf_lab specifications`,
  );
  void lowered;

  // ── 07 plan ─────────────────────────────────────────────────────────────────
  const plan = pass(
    'plan',
    () => {
      const stages = [
        { stage: 0, label: 'capabilities', captures: [...new Set(instances.map((i) => `capabilities@${i.host}`))] },
        { stage: 1, label: 'captures', captures: instances.filter((i) => i.stage === 1).map((i) => i.id) },
        { stage: 2, label: 'evidence-dependent captures', captures: instances.filter((i) => i.stage === 2).map((i) => i.id) },
      ].filter((s) => s.captures.length);
      const count = (st: string) => instances.filter((i) => i.status === st).length;
      return {
        stages,
        captures: instances.map((i) => ({
          id: i.id,
          experiment: i.experiment,
          arm: i.arm,
          mode: i.mode,
          ref: i.ref,
          reps: i.reps,
          hash: i.hash,
          status: i.status,
          stage: i.stage,
          blockedOn: i.blockedOn,
          estimateGpuMin: i.estimateGpuMin,
          host: i.host,
          lowered: i.spec,
        })),
        execute: count('execute'),
        import: count('import'),
        cached: count('cached'),
        blocked: count('blocked'),
        estimateGpuMin: +instances.filter((i) => i.status !== 'cached').reduce((a, i) => a + i.estimateGpuMin, 0).toFixed(1),
      };
    },
    (p) => `${p.cached} cached · ${p.execute} execute · ${p.import ? `${p.import} import · ` : ''}${p.blocked} blocked`,
  );

  // ── IR graph ────────────────────────────────────────────────────────────────
  addNode({ id: 'lab', kind: 'lab', label: lab.titleText });
  for (const p of registry.params.values()) {
    addNode({ id: `param:${p.slot.key}`, kind: 'param', label: p.slot.urlKey, parent: p.slot.scope === 'board' ? `board:${p.slot.owner}` : p.slot.scope === 'experiment' ? `experiment:${p.slot.owner}` : 'lab', binding: p.summary.binding, detail: `${p.summary.control} · ${p.summary.binding}` });
  }
  for (const exp of registry.experiments.values()) {
    const id = `experiment:${exp.id}`;
    addNode({ id, kind: 'experiment', label: exp.id, parent: 'lab', detail: `${exp.workload.adapter} · ${exp.host}${exp.forkOf ? ` · fork of ${exp.forkOf}` : ''}`, props: toJsonSafe(exp) as Record<string, unknown> });
    addEdge('lab', id, 'contains');
    for (const arm of exp.arms) {
      const aid = `${id}/arm:${arm.name}`;
      addNode({ id: aid, kind: 'arm', label: arm.name, parent: id, detail: arm.skipped ? `skipped · ${arm.skipped}` : `rev ${arm.rev}`, status: arm.skipped ? 'skipped' : undefined });
      addEdge(id, aid, 'contains');
    }
  }
  for (const i of instances) {
    addNode({ id: i.id, kind: 'capture', label: `${i.arm}/${i.mode}`, parent: `experiment:${i.experiment}/arm:${i.arm}`, hash: i.hash, status: i.status, detail: `${i.mode} ×${i.reps} · ${i.hash.slice(0, 8)}`, props: i.spec });
    addEdge(`experiment:${i.experiment}/arm:${i.arm}`, i.id, 'contains');
    if (i.status === 'cached') {
      const imp = `import:${i.ref}`;
      addNode({ id: imp, kind: 'import', label: i.ref, parent: i.id, detail: `${i.reps} run${i.reps === 1 ? '' : 's'}` });
      addEdge(i.id, imp, 'produces');
    }
    if (i.dependsOn) addEdge(`import:${i.dependsOn.replace('capture:', '')}`, i.id, 'input');
  }
  for (const d of lab.derives) {
    const id = `derive:${d.name}`;
    addNode({ id, kind: 'derive', label: d.name, parent: 'lab', phase: 'data', detail: isQuery(d.input) ? d.input.describe() : isCompare(d.input) ? 'compare(…)' : 'input' });
    const patterns: unknown[] = [];
    const derivesIn: string[] = [];
    const collect = (x: unknown) => {
      if (isQuery(x)) {
        patterns.push(...x.inputs().patterns);
        derivesIn.push(...x.inputs().derives);
      } else if (isCompare(x)) patterns.push(x.left, x.right);
      else if (Array.isArray(x)) x.forEach(collect);
    };
    collect(d.input);
    for (const p of patterns) {
      if (typeof p !== 'string') continue;
      for (const inst of instancesForPattern(instances, p)) if (inst.status === 'cached') addEdge(`import:${inst.ref}`, id, 'input');
    }
    for (const dn of derivesIn) addEdge(`derive:${dn}`, id, 'input');
  }
  for (const h of lab.hypotheses) {
    addNode({ id: `hypothesis:${h.id}`, kind: 'hypothesis', label: h.id, parent: 'lab', detail: h.claimText.slice(0, 80) });
    if (h.prediction) for (const dn of h.prediction.query.inputs().derives) addEdge(`derive:${dn}`, `hypothesis:${h.id}`, 'evidence');
  }
  const boardSummaries: BoardSummary[] = [];
  lab.boards.forEach((b: BoardB, index) => {
    const id = `board:${b.id}`;
    addNode({ id, kind: 'board', label: b.id, parent: 'lab', detail: typeof b.titleText === 'string' ? b.titleText : undefined });
    addEdge('lab', id, 'contains');
    const kinds: string[] = [];
    const walk = (v: ViewB, parent: string) => {
      const vid = `view:${b.id}/${v.name ?? `${v.componentName ?? v.kind}·${v.id.replace('view:', '')}`}`;
      kinds.push(v.componentName ?? v.kind);
      addNode({ id: vid, kind: 'view', label: v.name ? `${v.componentName ?? v.kind}#${v.name}` : (v.componentName ?? v.kind), parent, phase: 'view' });
      addEdge(parent, vid, 'contains');
      v.children.forEach((c) => walk(c, vid));
      Object.values(v.slots).forEach((c) => walk(c, vid));
    };
    b.views.forEach((v) => walk(v, id));
    for (const s of b.sigs) {
      addNode({ id: `signal:${s.key}`, kind: 'signal', label: s.name, parent: id });
    }
    const exps = boardExperiments.get(b.id) ?? new Set<string>();
    const paramKeys = [
      ...lab.params.map((p) => p.key),
      ...lab.experiments.filter((e) => [...exps].some((x) => globToRegExp(x).test(e.id))).flatMap((e) => e.params.map((p) => p.key)),
      ...b.params.map((p) => p.key),
    ];
    // a lab or experiment parameter read by this board's lambdas also belongs on its bar
    for (const vr of viewReaders.filter((v) => v.board === b.id)) for (const d of vr.deps) if (d.kind === 'param' && !paramKeys.includes(d.key)) paramKeys.push(d.key);
    boardSummaries.push({
      id: b.id,
      index,
      title: typeof b.titleText === 'string' ? b.titleText : b.titleText === undefined ? b.id : '(live title)',
      subtitle: typeof b.subtitleText === 'string' ? b.subtitleText : undefined,
      viewKinds: [...new Set(kinds)],
      paramKeys,
      presets: b.presets,
      experiments: [...registry.experiments.keys()].filter((id) => [...exps].some((e) => globToRegExp(e).test(id))),
      signals: b.sigs.length,
    });
  });
  for (const vr of viewReaders) {
    for (const d of vr.deps) {
      const from = d.kind === 'param' ? `param:${d.key}` : d.kind === 'signal' ? `signal:${d.key}` : `derive:${d.key}`;
      if (nodeIds.has(from) && nodeIds.has(vr.view)) addEdge(from, vr.view, d.kind === 'derive' ? 'input' : 'reads');
    }
  }
  for (const rd of reads) {
    if (rd.phase === 'plan') {
      const target = rd.reader.startsWith('experiment:') ? rd.reader.split('/').slice(0, 1).join('/') : rd.reader;
      if (nodeIds.has(target)) addEdge(`param:${rd.param}`, target, 'reads');
    }
    if (rd.phase === 'data') addEdge(`param:${rd.param}`, rd.reader, 'reads');
  }
  const seen = new Set<string>();
  const dedupedEdges = edges.filter((e) => {
    const k = `${e.from}>${e.to}>${e.kind}`;
    if (seen.has(k) || !nodeIds.has(e.from) || !nodeIds.has(e.to)) return false;
    seen.add(k);
    return true;
  });

  const stats = {
    nodes: nodes.length,
    edges: dedupedEdges.length,
    experiments: registry.experiments.size,
    captures: instances.length,
    derives: lab.derives.length,
    params: registry.params.size,
    planLambdas,
    dataLambdas: lab.derives.length,
    liveLambdas: liveCount,
    boards: lab.boards.length,
    lint: lint.filter((l) => l.level !== 'info').length,
  };

  const ir: IR = {
    buildId,
    version: 1,
    labId: input.labId,
    title: lab.titleText,
    nodes,
    edges: dedupedEdges,
    passes,
    lint,
    boards: boardSummaries,
    params: [...registry.params.values()].map((p: ParamRuntime) => p.summary),
    plan,
    experiments: [...registry.experiments.values()].map((e) => ({
      id: e.id,
      question: e.question,
      host: e.host,
      boundary: e.boundary,
      workload: e.workload.adapter,
      arms: e.arms.map((a) => ({ name: a.name, rev: a.rev, role: a.role, skipped: a.skipped, cell: a.cell })),
      captures: instances.filter((i) => i.experiment === e.id).map((i) => i.id),
      limitations: e.limitations,
      forkOf: e.forkOf,
      purpose: e.purpose,
    })),
    hypotheses: lab.hypotheses.map((h) => ({ id: h.id, claim: h.claimText })),
    stats,
    durationMs: +(performance.now() - t0).toFixed(1),
  };
  registry.ir = ir;
  return { ir, registry };
}

export const paramSpecOf = (reg: BuildRegistry, key: string): ParamSpec | undefined => {
  const p = reg.params.get(key)?.slot.spec;
  return p && isParamSpec(p) ? p : undefined;
};
