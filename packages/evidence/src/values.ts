// Values: numbers that carry where they came from. Ported from Perf Lab (PL/src/lang/values.ts) with three
// changes: the seal is deep and also refuses defineProperty, setPrototypeOf and preventExtensions (P-6);
// a plain number has provenance 'unknown' rather than 'observed' (P-7); and constructors turn a null or
// non-finite number into a missing value, so NaN never passes as data.

export type Prov = 'observed' | 'derived' | 'heuristic' | 'illustrative' | 'unknown';

/** A scalar with its provenance. Missing data is `value: null, prov: 'unknown'` with a reason — never zero. */
export interface Value {
  readonly __value: true;
  readonly value: number | string | boolean | null;
  readonly prov: Prov;
  readonly unit?: string;
  readonly reason?: string;
  readonly method?: string;
  readonly source?: string;
  readonly scope?: string;
  readonly denominator?: string;
  readonly metric?: string;
  /** Interval around `value`, for estimates (lo, hi) */
  readonly ci?: readonly [number, number];
  /** Number of repetitions behind an estimate */
  readonly n?: number;
}

export interface ValueOpts {
  unit?: string;
  method?: string;
  source?: string;
  scope?: string;
  denominator?: string;
  metric?: string;
  ci?: readonly [number, number];
  n?: number;
}

export const isValue = (x: unknown): x is Value => typeof x === 'object' && x !== null && (x as Value).__value === true;

/**
 * Values compare like their number (`a.time < b.time`); a missing value compares as NaN, so every relational
 * test on it is false rather than treating unknown as zero.
 */
const VALUE_PROTO = {
  valueOf(this: Value): number | string | boolean {
    return this.value === null ? Number.NaN : this.value;
  },
  toString(this: Value): string {
    return this.value === null ? `missing(${this.reason ?? ''})` : `${this.value}${this.unit ? ` ${this.unit}` : ''}`;
  },
};

function makeValue(fields: { [k: string]: unknown; value: Value['value']; prov: Prov }): Value {
  const out: Record<string, unknown> = Object.create(VALUE_PROTO);
  out.__value = true;
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) out[k] = v;
  return out as unknown as Value;
}

const known = (prov: Exclude<Prov, 'unknown'>) =>
  (value: number | string | boolean | null, opts: ValueOpts = {}): Value => {
    if (value === null || value === undefined) return missing(`no ${prov} value`, opts);
    if (typeof value === 'number' && !Number.isFinite(value)) return missing(`${prov} value is not a finite number (${value})`, opts);
    return makeValue({ ...opts, value, prov });
  };

/** Measured on hardware (one repetition's sample, an Nsight counter). */
export const observed = known('observed');
/** Computed from other values by a stated method (a median, a ratio, simulator counts). */
export const derived = known('derived');
/** A judgement or a model, not a computation from observations (the cost model, the simulator's time). */
export const heuristic = known('heuristic');
/** A teaching fixture, not this system's state. */
export const illustrative = known('illustrative');

/** Not measured: always carries the reason. */
export function missing(reason: string, opts: Pick<ValueOpts, 'unit' | 'method' | 'source' | 'scope' | 'metric'> = {}): Value {
  return makeValue({ unit: opts.unit, method: opts.method, source: opts.source, scope: opts.scope, metric: opts.metric, value: null, prov: 'unknown', reason });
}

/** Plain value of a cell: unwraps Values, keeps everything else. */
export const raw = (x: unknown): unknown => (isValue(x) ? x.value : x);

/** The finite number inside a cell, or null. */
export const num = (x: unknown): number | null => {
  const r = raw(x);
  return typeof r === 'number' && Number.isFinite(r) ? r : null;
};

/** Missing: a missing Value, null, undefined, or a plain NaN. */
export const isMissing = (x: unknown): boolean =>
  isValue(x) ? x.value === null : x === null || x === undefined || (typeof x === 'number' && Number.isNaN(x));

/** Provenance of a cell. A plain number has no stated origin, so it is 'unknown' unless the caller says otherwise. */
export function provOf(x: unknown, fallback: Prov = 'unknown'): Prov {
  return isValue(x) ? x.prov : fallback;
}

const STRENGTH: Record<Prov, number> = { unknown: 0, illustrative: 1, heuristic: 2, derived: 3, observed: 3 };
const BY_STRENGTH: Prov[] = ['unknown', 'illustrative', 'heuristic', 'derived'];

/**
 * The provenance of a value computed from inputs: the weakest input class, in the order
 * unknown < illustrative < heuristic < derived, where observed inputs yield derived (a computation over
 * observations is not itself an observation). With no inputs the result is 'unknown'.
 */
export function combine(...inputs: Array<Prov | Value>): Prov {
  if (!inputs.length) return 'unknown';
  let weakest = 3;
  for (const x of inputs) {
    const p = isValue(x) ? x.prov : x;
    const s = STRENGTH[p];
    if (s === undefined) throw new TypeError(`combine: not a provenance class: ${String(p)}`);
    weakest = Math.min(weakest, s);
  }
  return BY_STRENGTH[weakest]!;
}

export class ProvenanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProvenanceError';
  }
}

const sealed = new WeakSet<object>();
const UNSUPPORTED = [Map, Set, WeakMap, WeakSet, Date, RegExp, Promise, ArrayBuffer];

/**
 * A read-only snapshot of `obj`, all the way down. Setting, deleting or defining a property, changing a
 * prototype or preventing extensions on it (or on anything reachable from it) throws ProvenanceError.
 * The snapshot is a deep copy taken now, so later changes to `obj` do not show through it; prototypes are
 * kept (Values still compare as numbers) and shared references and cycles are preserved.
 * Primitives and functions are returned as they are; Map, Set, Date, RegExp and binary data are refused.
 */
export function seal<T>(obj: T): T {
  const memo = new Map<object, object>();
  const refuse = (verb: string, prop?: string | symbol): never => {
    throw new ProvenanceError(
      `sealed evidence is read-only (tried to ${verb}${prop === undefined ? '' : ` ${String(prop)}`}). Record a note, a derived value or a hypothesis instead.`,
    );
  };
  const handler: ProxyHandler<object> = {
    set: (_t, prop) => refuse('set', prop),
    deleteProperty: (_t, prop) => refuse('delete', prop),
    defineProperty: (_t, prop) => refuse('define', prop),
    setPrototypeOf: () => refuse('change the prototype of'),
    preventExtensions: () => refuse('prevent extensions on'),
  };
  const walk = (x: unknown): unknown => {
    if (typeof x !== 'object' || x === null || sealed.has(x)) return x;
    const hit = memo.get(x);
    if (hit) return hit;
    if (UNSUPPORTED.some((C) => x instanceof C) || ArrayBuffer.isView(x)) {
      throw new ProvenanceError(`seal: cannot seal a ${Object.prototype.toString.call(x)}`);
    }
    const shell: object = Array.isArray(x) ? [] : Object.create(Object.getPrototypeOf(x));
    const proxy = new Proxy(shell, handler);
    memo.set(x, proxy);
    sealed.add(proxy);
    for (const key of Reflect.ownKeys(x)) {
      if (Array.isArray(x) && key === 'length') continue;
      const d = Object.getOwnPropertyDescriptor(x, key)!;
      // accessors are read once: the snapshot holds what they returned
      const value = walk('value' in d ? d.value : Reflect.get(x, key));
      Object.defineProperty(shell, key, { value, enumerable: d.enumerable ?? false, writable: true, configurable: true });
    }
    if (Array.isArray(x)) (shell as unknown[]).length = x.length;
    return proxy;
  };
  return walk(obj) as T;
}

/** True for anything returned by `seal` (and for objects reached through one). */
export const isSealed = (x: unknown): boolean => typeof x === 'object' && x !== null && sealed.has(x);
