// The verdict of a hypothesis (guide §29.3). This is the only implementation; the UI, the agent, the server
// and the tests call it. Compared with Perf Lab's (HypothesisView.tsx, P-8): a predicate that throws makes
// its row undecided instead of refuting, and a row whose inputs are missing can neither support nor refute,
// which closes the negative-predicate hole (`!(r.x > 1)` is true when x is missing).
import { isMissing, isValue, ProvenanceError } from './values.ts';

export type Verdict = 'supported' | 'refuted' | 'open' | 'unqualified';

export interface Check<Row> {
  row: Row;
  /** true: the row supports the claim; false: a clean counterexample; null: undecided */
  pass: boolean | null;
  /** Fields the predicate read whose values are missing */
  missing: string[];
  /** The predicate's error message, when it threw */
  error?: string;
}

/** A record the predicate's rows were computed from; only its validity matters here. */
export interface SupportRecord {
  id?: string;
  validity?: { ok: boolean; reasons: readonly string[] };
}

export interface VerdictInput<Row extends object> {
  rows: readonly Row[];
  predicate: (row: Row) => unknown;
  /** Every record read while computing `rows` */
  support?: readonly SupportRecord[];
}

export interface VerdictResult<Row> {
  verdict: Verdict;
  checks: Check<Row>[];
  reasons: string[];
}

/**
 * Judge `predicate` over `rows`:
 * 1. any invalid record in `support` → unqualified (its validity reasons);
 * 2. no rows → open ("no rows: nothing measured yet");
 * 3. per row: a throw is undecided (null, error kept); a result that is NaN or a missing Value is undecided;
 *    a decided result whose predicate read a missing field becomes undecided — it neither supports nor refutes;
 * 4. any clean false → refuted; else any undecided → open; else supported.
 * "Read" is tracked at every depth (`r.k.t` records `k.t`): a missing field the predicate never looked at does not
 * make its row undecided, and a missing field it read through a nested object does.
 */
export function verdict<Row extends object>({ rows, predicate, support = [] }: VerdictInput<Row>): VerdictResult<Row> {
  const invalid = support.filter((r) => !r.validity?.ok);
  if (invalid.length) {
    const reasons = invalid.flatMap((r) => {
      const who = r.id ? `record ${r.id.slice(0, 12)}` : 'a supporting record';
      const why = r.validity ? r.validity.reasons : ['no validity'];
      return why.length ? why.map((w) => `${who}: ${w}`) : [`${who}: invalid`];
    });
    return { verdict: 'unqualified', checks: [], reasons };
  }
  if (!rows.length) return { verdict: 'open', checks: [], reasons: ['no rows: nothing measured yet'] };

  const checks = rows.map((row): Check<Row> => {
    const read = new Map<string, readonly string[]>();
    const view = track(row, [], read);
    let out: unknown;
    try {
      out = predicate(view);
    } catch (e) {
      return { row, pass: null, missing: missingOf(row, read), error: e instanceof Error ? e.message : String(e) };
    }
    const missing = missingOf(row, read);
    let pass: boolean | null;
    if (isValue(out)) pass = out.value === null ? null : Boolean(out.value);
    else if (typeof out === 'number' && Number.isNaN(out)) pass = null;
    else pass = Boolean(out);
    if (missing.length) pass = null;
    return { row, pass, missing };
  });

  const refuting = checks.map((c, i) => [c, i] as const).filter(([c]) => c.pass === false);
  if (refuting.length) return { verdict: 'refuted', checks, reasons: refuting.map(([, i]) => `row ${i}: the prediction does not hold`) };
  const open = checks.map((c, i) => [c, i] as const).filter(([c]) => c.pass === null);
  if (open.length) {
    return {
      verdict: 'open',
      checks,
      reasons: open.map(([c, i]) =>
        c.error ? `row ${i}: the predicate threw: ${c.error}` : c.missing.length ? `row ${i}: missing ${c.missing.join(', ')}` : `row ${i}: the predicate returned a missing value`),
    };
  }
  return { verdict: 'supported', checks, reasons: [] };
}

const readOnly = (): never => { throw new ProvenanceError('a predicate cannot change its row'); };
const isPlainOrArray = (x: unknown): x is object => {
  if (typeof x !== 'object' || x === null || isValue(x)) return false;
  const proto = Object.getPrototypeOf(x);
  return Array.isArray(x) || proto === Object.prototype || proto === null;
};

/**
 * A read-only view of `target` that records the path of every own property read and wraps the plain objects and
 * arrays it returns in the same view; Values (leaves) and class instances are returned as they are. The proxy's
 * target is an empty shell that forwards to `target`, so the proxy invariants never bind it to `target`'s
 * properties: frozen rows are tracked like any other.
 */
function track<T extends object>(target: T, path: readonly string[], read: Map<string, readonly string[]>): T {
  const isArr = Array.isArray(target);
  const shell = (isArr ? [] : Object.create(Object.getPrototypeOf(target))) as T;
  return new Proxy(shell, {
    get(_s, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof prop !== 'string' || !Object.prototype.hasOwnProperty.call(target, prop)) return value;
      const at = [...path, prop];
      read.set(at.join('.'), at);
      return isPlainOrArray(value) ? track(value, at, read) : value;
    },
    has: (_s, prop) => Reflect.has(target, prop),
    ownKeys: () => Reflect.ownKeys(target),
    getOwnPropertyDescriptor(_s, prop) {
      const d = Reflect.getOwnPropertyDescriptor(target, prop);
      if (!d) return undefined;
      // the shell's only own property is an array's length (non-configurable, writable); report the rest configurable
      return isArr && prop === 'length' ? { ...d, writable: true, configurable: false } : { ...d, configurable: true };
    },
    set: readOnly,
    deleteProperty: readOnly,
    defineProperty: readOnly,
    setPrototypeOf: readOnly,
    preventExtensions: readOnly,
  });
}

function missingOf(row: object, read: ReadonlyMap<string, readonly string[]>): string[] {
  const at = (keys: readonly string[]): unknown => keys.reduce<unknown>((o, k) => (o !== null && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), row);
  return [...read].filter(([, keys]) => isMissing(at(keys))).map(([name]) => name);
}
