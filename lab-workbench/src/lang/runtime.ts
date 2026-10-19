import type { BoardB, DeriveDecl, HypothesisB, LabB, ParamSlot } from './builders';
import { isCompare } from './compare';
import type { CaptureInstance } from './env';
import type { IR, ParamSummary } from './ir';
import { isQuery, type QueryEnv } from './query';
import { isLive, isParamRef, isSignalRef, type Dollar, type LiveFn, type SignalRef } from './refs';
import { isEnt, type DataSource } from './rows';
import { globToRegExp } from './util';

export interface ParamRuntime {
  slot: ParamSlot;
  summary: ParamSummary;
}

export interface ResolvedArm {
  name: string;
  role: string;
  rev: string;
  switches?: unknown;
  corunner?: unknown;
  pin?: unknown;
  cell?: Record<string, unknown>;
  skipped?: string;
}

export interface ResolvedExperiment {
  id: string;
  host: string;
  question?: string;
  boundary?: string;
  workload: { adapter: string; opts: Record<string, unknown> };
  state?: Record<string, unknown>;
  warmup?: Record<string, unknown>;
  expect?: { expect: Record<string, unknown>; arm?: string; onMiss?: string };
  gate?: Record<string, unknown>;
  repeat?: { processes?: number; order?: unknown };
  compare?: unknown;
  phases: { type: string; name: string; opts: Record<string, unknown> }[];
  offer?: Record<string, unknown>;
  admission?: Record<string, unknown>;
  deadline?: unknown;
  drain?: unknown;
  units?: unknown[];
  purpose?: string;
  forkOf?: string;
  arms: ResolvedArm[];
  limitations: string[];
  /** captures come from this archive instead of being executed (ML-PERF-002) */
  evidence?: { archive_sha256: string; format: string; reports: Record<string, string[]> | null; name?: string };
}

/** Everything a build produced that cannot live in Redux (builders, lambdas, data source, caches). */
export interface BuildRegistry {
  buildId: string;
  labId: string;
  lab: LabB;
  ir: IR;
  experiments: Map<string, ResolvedExperiment>;
  instances: CaptureInstance[];
  boards: Map<string, BoardB>;
  derives: Map<string, DeriveDecl>;
  hypotheses: Map<string, HypothesisB>;
  params: Map<string, ParamRuntime>;
  source: DataSource;
  deriveReads: Map<string, string[]>;
  deriveCache: Map<string, unknown>;
  lambdaSources: Map<string, string>;
}

export interface RuntimeState {
  /** Applied parameter values by storage key. */
  params: Record<string, unknown>;
  /** Board signal values by signal key. */
  signals: Record<string, unknown>;
}

export interface Tracker {
  read(kind: 'param' | 'signal' | 'derive', key: string): void;
}

export function paramRuntime(reg: BuildRegistry, ref: unknown, scopeHint?: string): ParamRuntime | undefined {
  if (isParamRef(ref)) return reg.params.get(ref.key);
  if (typeof ref !== 'string') return undefined;
  if (reg.params.has(ref)) return reg.params.get(ref);
  if (scopeHint && reg.params.has(`${scopeHint}.${ref}`)) return reg.params.get(`${scopeHint}.${ref}`);
  if (scopeHint && reg.params.has(`${scopeHint}:${ref}`)) return reg.params.get(`${scopeHint}:${ref}`);
  for (const p of reg.params.values()) if (p.slot.urlKey === ref || p.slot.name === ref) return p;
  return undefined;
}

export function runsMatching(reg: BuildRegistry, pattern: string): string[] {
  const p = pattern.includes('#') ? pattern : `${pattern}#*`;
  return reg.source.runs(p).map((r) => r.ref);
}

export function paramValue(reg: BuildRegistry, key: string, state: RuntimeState): unknown {
  const p = reg.params.get(key);
  if (!p) return undefined;
  const v = key in state.params ? state.params[key] : p.summary.defaultValue;
  if (p.summary.control === 'pickRun' && (v === null || v === undefined)) {
    return runsMatching(reg, p.summary.constraints.runPattern ?? '*/*/*')[0] ?? null;
  }
  return v;
}

export function evaluateInput(reg: BuildRegistry, input: unknown, env: QueryEnv): unknown {
  if (isQuery(input)) return input.evaluate(env);
  if (isCompare(input)) return input.evaluate(reg.source, env.resolveArg);
  if (Array.isArray(input)) return input.map((x) => evaluateInput(reg, x, env));
  return env.resolveArg(input);
}

export function readDerive(reg: BuildRegistry, name: string, state: RuntimeState, tracker?: Tracker, stack: string[] = []): unknown {
  const decl = reg.derives.get(name);
  if (!decl) throw new Error(`unknown derive "${name}"`);
  if (stack.includes(name)) throw new Error(`derive cycle: ${[...stack, name].join(' → ')}`);
  tracker?.read('derive', name);
  const known = reg.deriveReads.get(name);
  const keyFor = (reads: string[]) => `${name}|${JSON.stringify(reads.map((k) => [k, paramValue(reg, k, state)]))}`;
  if (known) {
    const hit = reg.deriveCache.get(keyFor(known));
    if (hit !== undefined) {
      for (const k of known) tracker?.read('param', k);
      return hit;
    }
  }
  const reads = new Set<string>();
  const local: Tracker = { read: (kind, key) => (kind === 'param' ? reads.add(key) : undefined) };
  const env = queryEnv(reg, state, local, [...stack, name]);
  const input = evaluateInput(reg, decl.input, env);
  const ctx = {
    param: (n: unknown) => {
      const p = paramRuntime(reg, n);
      if (!p) throw new Error(`unknown parameter ${String(isParamRef(n) ? n.key : n)}`);
      reads.add(p.slot.key);
      return paramValue(reg, p.slot.key, state);
    },
    data: (n: string) => reg.lab.dataMap[n],
  };
  const result = markDerived(decl.fn(input, ctx));
  const readList = [...reads].sort();
  reg.deriveReads.set(name, readList);
  reg.deriveCache.set(keyFor(readList), result === undefined ? null : result);
  // a derive that reads another derive inherits its parameter reads
  for (const k of readList) tracker?.read('param', k);
  return result;
}

/**
 * Rows a derive computes are derived. Entities it merely filters stay observed, and value records keep
 * their own provenance; only plain computed objects are marked.
 */
function markDerived<T>(result: T): T {
  if (!Array.isArray(result)) return result;
  for (const row of result) {
    if (row && typeof row === 'object' && !isEnt(row) && Object.isExtensible(row) && !('__prov' in row)) {
      Object.defineProperty(row, '__prov', { value: 'derived', enumerable: false });
    }
  }
  return result;
}

export function queryEnv(reg: BuildRegistry, state: RuntimeState, tracker?: Tracker, stack: string[] = []): QueryEnv {
  const $ = makeDollar(reg, state, { tracker });
  return {
    source: reg.source,
    resolveArg: (a) => resolveValue(a, $),
    readDerive: (n) => readDerive(reg, n, state, tracker, stack),
  };
}

/** Resolve a view-slot value: params, signals, live lambdas, queries and comparisons. */
export function resolveValue(x: unknown, $: Dollar): unknown {
  if (isParamRef(x) || isSignalRef(x)) return $(x);
  if (isLive(x)) return (x as LiveFn).fn($);
  return x;
}

export function materialize(reg: BuildRegistry, x: unknown, state: RuntimeState, tracker?: Tracker): unknown {
  const env = queryEnv(reg, state, tracker);
  const v = env.resolveArg(x);
  if (isQuery(v)) return v.evaluate(env);
  if (isCompare(v)) return v.evaluate(reg.source, env.resolveArg);
  return v;
}

export interface DollarOptions {
  tracker?: Tracker;
  set?: (ref: unknown, value: unknown) => void;
  event?: Record<string, unknown>;
}

export function signalValue(reg: BuildRegistry, ref: SignalRef, state: RuntimeState, $: Dollar): unknown {
  const board = reg.boards.get(ref.board);
  const derivedSig = board?.derivedSigs.find((d) => d.ref.key === ref.key);
  if (derivedSig) return derivedSig.fn.fn($);
  const v = ref.key in state.signals ? state.signals[ref.key] : ref.init;
  return rehydrate(reg, v);
}

export function makeDollar(reg: BuildRegistry, state: RuntimeState, opts: DollarOptions = {}): Dollar {
  const read = (ref: unknown, track: boolean): unknown => {
    if (isParamRef(ref)) {
      if (track) opts.tracker?.read('param', ref.key);
      return paramValue(reg, ref.key, state);
    }
    if (isSignalRef(ref)) {
      if (track) opts.tracker?.read('signal', ref.key);
      return signalValue(reg, ref, state, $);
    }
    if (isLive(ref)) return ref.fn($);
    if (typeof ref === 'string') {
      const p = paramRuntime(reg, ref);
      if (p) {
        if (track) opts.tracker?.read('param', p.slot.key);
        return paramValue(reg, p.slot.key, state);
      }
    }
    return ref;
  };
  const $ = ((ref: unknown) => read(ref, true)) as Dollar;
  $.read = (name: string) => readDerive(reg, name, state, opts.tracker);
  $.peek = (ref: unknown) => read(ref, false);
  $.set = (ref: unknown, value: unknown) => {
    if (!opts.set) throw new Error('$.set is only available in event handlers and effects');
    const next = typeof value === 'function' ? (value as (v: unknown) => unknown)(read(ref, false)) : value;
    opts.set(ref, next);
  };
  if (opts.event) Object.assign($, opts.event);
  return $;
}

/** Signals store entities by reference so state stays serializable; reads turn them back into entities. */
export const dehydrate = (v: unknown): unknown =>
  v && typeof v === 'object' && typeof (v as { ref?: unknown }).ref === 'string' && 'kind' in (v as object) && typeof (v as { metric?: unknown }).metric === 'function'
    ? { __ent: (v as { ref: string }).ref }
    : v;

export const rehydrate = (reg: BuildRegistry, v: unknown): unknown =>
  v && typeof v === 'object' && '__ent' in (v as object) ? (reg.source.entity((v as { __ent: string }).__ent) ?? null) : v;

export function patternExperiments(pattern: unknown): string[] {
  // only run patterns (experiment/arm/mode) name experiments; other strings are field names or labels
  if (typeof pattern !== 'string' || !/^[^/\s:]+\/[^/\s:]+\/[^/\s:#]+(#[\d*]+)?$/.test(pattern)) return [];
  const exp = pattern.split('/')[0];
  return exp ? [exp] : [];
}

export function instancesForPattern(instances: CaptureInstance[], pattern: string): CaptureInstance[] {
  const base = pattern.split('#')[0];
  const re = globToRegExp(base);
  return instances.filter((i) => re.test(i.ref));
}
