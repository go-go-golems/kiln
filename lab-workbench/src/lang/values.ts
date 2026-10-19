export type Prov = 'observed' | 'derived' | 'heuristic' | 'illustrative' | 'unknown';
export type Evidence = 'direct' | 'derived' | 'heuristic' | 'illustrative' | 'unknown';

/** A scalar with its provenance. Missing data is `value: null, prov: 'unknown'` with a reason — never zero. */
export interface Value {
  __value: true;
  value: number | string | boolean | null;
  unit?: string;
  prov: Prov;
  reason?: string;
  source?: string;
  scope?: string;
  denominator?: string;
  method?: string;
  metric?: string;
}

export const isValue = (x: unknown): x is Value => typeof x === 'object' && x !== null && (x as Value).__value === true;

/**
 * Values compare like their number (`a.measured < a.logical`); a missing value compares as NaN, so every
 * relational test on it is false rather than treating unknown as zero.
 */
const VALUE_PROTO = {
  valueOf(this: Value) {
    return typeof this.value === 'number' ? this.value : this.value === null ? Number.NaN : this.value;
  },
  toString(this: Value) {
    return this.value === null ? `missing(${this.reason ?? ''})` : `${this.value}${this.unit ? ` ${this.unit}` : ''}`;
  },
};

export function makeValue(fields: Omit<Value, '__value'>): Value {
  return Object.assign(Object.create(VALUE_PROTO), { __value: true, ...fields }) as Value;
}

/** Copy of a value with some fields replaced, keeping value semantics. */
export const withValue = (v: Value, patch: Partial<Value>): Value => makeValue({ ...v, ...patch });

export function val(value: Value['value'], opts: Partial<Omit<Value, '__value' | 'value'>> = {}): Value {
  return makeValue({ value, prov: 'observed', ...opts });
}

export function missing(reason: string, opts: Partial<Omit<Value, '__value' | 'value' | 'prov' | 'reason'>> = {}): Value {
  return makeValue({ value: null, prov: 'unknown', reason, ...opts });
}

export function derived(value: Value['value'], opts: Partial<Omit<Value, '__value' | 'value' | 'prov'>> = {}): Value {
  return makeValue({ value, prov: 'derived', ...opts });
}

export function illustrative(value: Value['value'], unit?: string): Value {
  return makeValue({ value, prov: 'illustrative', unit });
}

/** Plain value of a cell: unwraps Value records, keeps everything else. */
export const raw = (x: unknown): unknown => (isValue(x) ? x.value : x);

export const num = (x: unknown): number | null => {
  const r = raw(x);
  return typeof r === 'number' && Number.isFinite(r) ? r : null;
};

export const isMissing = (x: unknown): boolean => (isValue(x) ? x.value === null : x === null || x === undefined);

export function provOf(x: unknown, fallback: Prov = 'observed'): Prov {
  return isValue(x) ? x.prov : fallback;
}

export class ProvenanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProvenanceError';
  }
}

/** Observed values are import-only: freeze them so assistant code cannot assign to them. */
export function sealObserved<T extends object>(obj: T): T {
  return new Proxy(obj, {
    set(_t, prop) {
      throw new ProvenanceError(
        `observed values are import-only (tried to set ${String(prop)}). Record a note, a derived value or a hypothesis.`,
      );
    },
    deleteProperty(_t, prop) {
      throw new ProvenanceError(`observed values are import-only (tried to delete ${String(prop)}).`);
    },
  });
}
