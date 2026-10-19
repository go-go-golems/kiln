// Values in the lab language are @kiln/evidence Values: one implementation of value semantics (guide §24, §33.1).
// This module only re-exports evidence's constructors and helpers and adds the two adapters the language needs:
// rebuilding a Value from its JSON fields (bundles cross the network as JSON) and copying one with a field changed.
// Compared with Perf Lab's values.ts: `val(…)` (observed) is gone — imported data arrives as JSON and is rebuilt here,
// synthetic data is `illustrative` (P-7); `sealObserved` is evidence's deep `seal` (P-6); a plain number has
// provenance 'unknown' in `provOf` (P-7); constructors turn null or non-finite numbers into missing values.
import {
  derived,
  heuristic,
  illustrative,
  missing,
  observed,
  type Prov,
  type Value,
  type ValueOpts,
} from '@kiln/evidence';

export {
  combine,
  derived,
  heuristic,
  illustrative,
  isMissing,
  isSealed,
  isValue,
  missing,
  num,
  observed,
  provOf,
  ProvenanceError,
  raw,
  seal,
  type Prov,
  type Value,
  type ValueOpts,
} from '@kiln/evidence';

/** The evidence class of a link between entities (how the relation was established), not a value's provenance. */
export type LinkEvidence = 'direct' | 'derived' | 'heuristic' | 'illustrative' | 'unknown';

/** The JSON form of a Value: what `JSON.stringify` keeps of one (bundles, the /api/lab routes). */
export interface ValueFields {
  __value?: true;
  value: number | string | boolean | null;
  prov: Prov;
  reason?: string;
  unit?: string;
  method?: string;
  source?: string;
  scope?: string;
  denominator?: string;
  metric?: string;
  ci?: readonly [number, number];
  n?: number;
}

const KNOWN = { observed, derived, heuristic, illustrative } as const;
const OPTS = ['unit', 'method', 'source', 'scope', 'denominator', 'metric', 'ci', 'n'] as const;

/**
 * A Value from its fields, through evidence's constructors (so a rebuilt Value has evidence's prototype and rules).
 * A null value, or the 'unknown' class, is missing; its recorded reason is kept. Evidence has no "unknown with a
 * value": such a field is rebuilt as missing with the recorded value in the reason, never silently as data.
 */
export function valueFrom(f: ValueFields): Value {
  const opts: ValueOpts = {};
  for (const k of OPTS) if (f[k] !== undefined) (opts as Record<string, unknown>)[k] = f[k];
  if (f.value === null || f.value === undefined) return missing(f.reason ?? `no ${f.prov} value`, opts);
  if (f.prov === 'unknown' || !(f.prov in KNOWN)) {
    return missing(`${f.reason ? `${f.reason}; ` : ''}value of ${f.prov === 'unknown' ? 'unknown' : `unrecognised (${String(f.prov)})`} provenance: ${String(f.value)}`, opts);
  }
  return KNOWN[f.prov as keyof typeof KNOWN](f.value, opts);
}

/**
 * A value computed from inputs, with the provenance `combine` gave it: evidence has one constructor per class, so a
 * computation whose class is decided at run time goes through here. 'unknown' (an input with no stated origin) is
 * missing, with the reason saying why.
 */
export function computed(prov: Prov, value: number | string | boolean | null, opts: ValueOpts = {}): Value {
  if (prov === 'unknown') return missing('computed from inputs of unknown provenance', opts);
  return (prov === 'observed' ? derived : KNOWN[prov])(value, opts);
}

/** `opts` without its undefined fields (exactOptionalPropertyTypes: an absent field is not an undefined one). */
export function defined<T extends object>(opts: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(opts)) if (v !== undefined) out[k] = v;
  return out as { [K in keyof T]?: Exclude<T[K], undefined> };
}

/** The fields of a Value, as JSON would keep them. */
export const fieldsOf = (v: Value): ValueFields => ({ ...(v as unknown as ValueFields) });

/** Copy of a value with some fields replaced, keeping value semantics. */
export const withValue = (v: Value, patch: Partial<ValueFields>): Value => valueFrom({ ...fieldsOf(v), ...patch });

/**
 * JSON loses the Value prototype; records keep their `__value` marker and are rebuilt here, at any depth.
 * Used on run bundles from the /api/lab/bundles route or Perf Lab's store.
 */
export function revive<T>(x: T): T {
  if (Array.isArray(x)) return x.map(revive) as T;
  if (x && typeof x === 'object') {
    // an evidence Value is rebuilt from its fields too (idempotent): `isValue` cannot tell JSON from a live Value
    const o = x as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) out[k] = revive(v);
    if (o.__value === true) return valueFrom(out as unknown as ValueFields) as T;
    return out as T;
  }
  return x;
}
