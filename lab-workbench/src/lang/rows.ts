import { derived, isValue, missing, num, sealObserved, withValue, type Evidence, type Value } from './values';
import { getPath, globToRegExp, quantile } from './util';

export type EntityKind =
  | 'run'
  | 'request'
  | 'span'
  | 'kernel'
  | 'code'
  | 'op'
  | 'tensor'
  | 'alloc'
  | 'instant'
  | 'batch'
  | 'graphgen'
  // ML-PERF-002: dataset-scoped (image, annotation) and run-scoped (detection, check)
  | 'image'
  | 'annotation'
  | 'detection'
  | 'check';

export interface Link {
  from: string;
  to: string;
  rel: string;
  evidence: Evidence;
  method?: string;
}

/** What the query engine needs from a data layer (synthetic now, imported artifacts later). */
export interface DataSource {
  runs(pattern: string): Ent[];
  entities(kind: EntityKind, pattern: string): Ent[];
  entity(ref: string): Ent | undefined;
  links(ref: string, rel: string | null, dir: 'fwd' | 'back'): Link[];
}

/** Units of plain numeric entity fields; aggregates inherit them. */
export const FIELD_UNITS: Record<string, string> = {
  latency: 'ms',
  timeInSystem: 'ms',
  queueDelay: 'ms',
  service: 'ms',
  dur: 'ms',
  submitLateness: 'ms',
  t: 's',
  scheduledArrival: 's',
  bytes: 'B',
  retainedBytes: 'B',
  logicalBytes: 'B',
  logicalTraffic: 'B',
  measuredTraffic: 'B',
  retained: 'B',
};

export interface Ent {
  kind: EntityKind;
  id: string;
  ref: string;
  run?: string;
  [field: string]: unknown;
  metric(name: string): Value;
  follow(...rels: string[]): Rows<Ent>;
  back(...rels: string[]): Rows<Ent>;
  overlaps(interval: { from: number; to: number }): boolean;
}

const ENT_PROTO = {
  metric(this: Ent, name: string): Value {
    const metrics = this.metrics as Record<string, Value> | undefined;
    const m = metrics?.[name];
    if (m) return m;
    const run = (this as unknown as { __src: () => DataSource }).__src().entity(this.run ?? '');
    const unsupported = (run?.coverage as { counters?: { unsupported?: string[] } } | undefined)?.counters?.unsupported ?? [];
    if (unsupported.some((u) => globToRegExp(u).test(name))) return missing('counter unsupported on this host', { metric: name });
    return missing(metrics ? 'not collected in this capture' : 'no counter capture for this entity', { metric: name });
  },
  follow(this: Ent, ...rels: string[]): Rows<Ent> {
    return traverse(this, rels, 'fwd');
  },
  back(this: Ent, ...rels: string[]): Rows<Ent> {
    return traverse(this, rels, 'back');
  },
  overlaps(this: Ent, interval: { from: number; to: number }): boolean {
    const s = num(this.t) ?? num(this.start);
    const e = num(this.tEnd) ?? num(this.end) ?? s;
    if (s === null || e === null) return false;
    return s <= interval.to && e >= interval.from;
  },
  toString(this: Ent) {
    return `${this.kind}:${this.id}`;
  },
};

function traverse(ent: Ent, rels: string[], dir: 'fwd' | 'back'): Rows<Ent> {
  const src = (ent as unknown as { __src: () => DataSource }).__src();
  const out = new Rows<Ent>();
  const seen = new Set<string>();
  for (const rel of rels.length ? rels : [null]) {
    for (const link of src.links(ent.ref, rel, dir)) {
      const target = src.entity(dir === 'fwd' ? link.to : link.from);
      if (target && !seen.has(target.ref)) {
        seen.add(target.ref);
        out.push(target);
      }
    }
  }
  return out;
}

/** An entity's fields before makeEnt gives it the query methods. */
export type RawEnt = Record<string, unknown> & { kind: EntityKind; id: string; ref: string };

export function makeEnt(data: RawEnt, src: DataSource): Ent {
  const e = Object.create(ENT_PROTO);
  Object.defineProperty(e, '__src', { value: () => src, enumerable: false });
  for (const [k, v] of Object.entries(data)) {
    e[k] = k === 'metrics' && v && typeof v === 'object' ? sealObserved(v as object) : v;
  }
  return sealObserved(e) as Ent;
}

export const isEnt = (x: unknown): x is Ent => typeof x === 'object' && x !== null && Object.getPrototypeOf(x) === ENT_PROTO;

type Key<T> = string | ((row: T) => unknown);
const keyFn = <T>(key: Key<T>) => (typeof key === 'function' ? key : (row: T) => getPath(row, key));

const STATS = ['count', 'sum', 'mean', 'min', 'p50', 'p95', 'p99', 'max', 'last'] as const;
type Stat = (typeof STATS)[number];

function computeStat(stat: Stat, values: number[], rows: unknown[]): number | null {
  const sorted = [...values].sort((a, b) => a - b);
  switch (stat) {
    case 'count':
      return rows.length;
    case 'sum':
      return values.reduce((a, b) => a + b, 0);
    case 'mean':
      return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    case 'min':
      return sorted.length ? sorted[0] : null;
    case 'max':
      return sorted.length ? sorted[sorted.length - 1] : null;
    case 'p50':
      return quantile(sorted, 0.5);
    case 'p95':
      return quantile(sorted, 0.95);
    case 'p99':
      return quantile(sorted, 0.99);
    case 'last':
      return values.length ? values[values.length - 1] : null;
  }
}

export function rows<U>(items: Iterable<U> | ArrayLike<U>): Rows<U> {
  const r = new Rows<U>();
  for (const x of Array.from(items)) r.push(x);
  return r;
}

/** An eager collection with the query vocabulary; the result of every data-time operation. */
export class Rows<T = unknown> extends Array<T> {
  where(fn: (row: T, i: number) => unknown): Rows<T> {
    return rows(Array.prototype.filter.call(this, fn as never) as T[]);
  }
  name(match: string | RegExp): Rows<T> {
    const re = typeof match === 'string' ? globToRegExp(match) : match;
    return this.where((r) => re.test(String((r as Record<string, unknown>).name ?? '')));
  }
  kind(...kinds: string[]): Rows<T> {
    const res = kinds.map((k) => globToRegExp(k));
    return this.where((r) => {
      const rec = r as Record<string, unknown>;
      const k = String(rec.type ?? rec.kind ?? '');
      return res.some((re) => re.test(k)) || kinds.includes(String(rec.kind));
    });
  }
  role(role: string): Rows<T> {
    return this.where((r) => (r as Record<string, unknown>).role === role);
  }
  phase(phase: string | null | undefined): Rows<T> {
    if (!phase) return this;
    return this.where((r) => (r as Record<string, unknown>).phase === phase);
  }
  arm(arm: string): Rows<T> {
    return this.where((r) => (r as Record<string, unknown>).arm === arm);
  }
  warm(): Rows<T> {
    return this.where((r) => (r as Record<string, unknown>).warm !== false);
  }
  /** Key-based sort (`'-latency'` descends) or a native comparator; never sorts in place. */
  sort(keyOrCompare?: Key<T> | ((a: T, b: T) => number)): this {
    if (typeof keyOrCompare === 'function' && keyOrCompare.length === 2) {
      return rows([...this].sort(keyOrCompare as (a: T, b: T) => number)) as unknown as this;
    }
    return this.orderBy((keyOrCompare ?? ((r: T) => r)) as Key<T>) as unknown as this;
  }
  orderBy(key: Key<T>): Rows<T> {
    const desc = typeof key === 'string' && key.startsWith('-');
    const f = keyFn<T>(typeof key === 'string' && desc ? key.slice(1) : key);
    const cmp = (a: T, b: T) => {
      const va = num(f(a)) ?? Number.NEGATIVE_INFINITY;
      const vb = num(f(b)) ?? Number.NEGATIVE_INFINITY;
      if (va === vb) {
        const sa = String(f(a));
        const sb = String(f(b));
        return sa < sb ? -1 : sa > sb ? 1 : 0;
      }
      return va - vb;
    };
    const out = rows([...this].sort(cmp));
    return desc ? rows([...out].reverse()) : out;
  }
  top(n: number, key: Key<T>): Rows<T> {
    const f = keyFn<T>(key);
    return rows([...this].sort((a, b) => (num(f(b)) ?? -Infinity) - (num(f(a)) ?? -Infinity)).slice(0, n));
  }
  distinct(key: Key<T>): Rows<unknown> {
    const f = keyFn<T>(key);
    return rows([...new Set([...this].map((r) => f(r)))]);
  }
  pluck(key: Key<T>): Rows<unknown> {
    return rows([...this].map(keyFn<T>(key)));
  }
  first(): T | null {
    return this.length ? this[0] : null;
  }
  one(): T | null {
    return this.first();
  }
  find2(fn: (row: T) => unknown): T | null {
    return ([...this].find(fn) ?? null) as T | null;
  }
  follow(...rels: string[]): Rows<Ent> {
    const out = new Rows<Ent>();
    const seen = new Set<string>();
    for (const r of this) {
      if (!isEnt(r)) continue;
      for (const t of r.follow(...rels)) if (!seen.has(t.ref)) (seen.add(t.ref), out.push(t));
    }
    return out;
  }
  back(...rels: string[]): Rows<Ent> {
    const out = new Rows<Ent>();
    const seen = new Set<string>();
    for (const r of this) {
      if (!isEnt(r)) continue;
      for (const t of r.back(...rels)) if (!seen.has(t.ref)) (seen.add(t.ref), out.push(t));
    }
    return out;
  }
  metric(name: string): Rows<Value> {
    return rows([...this].map((r) => (isEnt(r) ? r.metric(name) : missing('not an entity'))));
  }
  /** Sum of numbers or values; missing values are excluded and reported. */
  sum(key?: Key<T>): Value {
    const f = key ? keyFn<T>(key) : (r: T) => r;
    const vals = [...this].map(f);
    const nums = vals.map(num).filter((x): x is number => x !== null);
    const excluded = vals.length - nums.length;
    const unit = vals.find(isValue)?.unit ?? (typeof key === 'string' ? FIELD_UNITS[key] : undefined);
    if (vals.length > 0 && nums.length === 0) return missing(`all ${vals.length} inputs missing`, { unit });
    return derived(
      nums.reduce((a, b) => a + b, 0),
      { unit, method: excluded ? `sum · ${excluded} of ${vals.length} excluded (missing)` : 'sum' },
    );
  }
  groupBy(...keys: string[]): Grouped<T> {
    return new Grouped(this, keys);
  }
  /** Summary statistics of one numeric field as derived values. */
  stats(key: Key<T>, stats: Stat[] = ['count', 'p50', 'p95', 'max']): Record<string, Value> {
    return aggregateField([...this], keyFn<T>(key), stats, typeof key === 'string' ? key : '');
  }
}

function aggregateField<T>(rows: T[], f: (r: T) => unknown, stats: Stat[], field: string): Record<string, Value> {
  const vals = rows.map(f);
  const nums = vals.map(num).filter((x): x is number => x !== null);
  const excluded = vals.length - nums.length;
  const unit = vals.find(isValue)?.unit ?? FIELD_UNITS[field.split('.').pop() ?? field];
  const out: Record<string, Value> = {};
  for (const s of stats) {
    const v = computeStat(s, nums, rows);
    out[s] =
      v === null
        ? missing(`no values for ${field}`, { unit })
        : derived(v, { unit: s === 'count' ? undefined : unit, method: excluded ? `${s} · ${excluded} missing excluded` : s });
  }
  return out;
}

export class Grouped<T> {
  constructor(
    private rows: Rows<T>,
    private keys: string[],
  ) {}
  private groups(): Map<string, T[]> {
    const m = new Map<string, T[]>();
    for (const r of this.rows) {
      const k = JSON.stringify(this.keys.map((key) => getPath(r, key) ?? null));
      const g = m.get(k);
      if (g) g.push(r);
      else m.set(k, [r]);
    }
    return m;
  }
  agg(spec: Record<string, Stat[] | Stat>): AggRows {
    const out = new AggRows();
    for (const [k, members] of this.groups()) {
      const keyVals = JSON.parse(k) as unknown[];
      const row: Record<string, unknown> = {};
      this.keys.forEach((key, i) => (row[key] = keyVals[i]));
      for (const [field, stats] of Object.entries(spec)) {
        row[field] = aggregateField(members, (r) => getPath(r, field), Array.isArray(stats) ? stats : [stats], field);
      }
      Object.defineProperty(row, '__members', { value: members, enumerable: false });
      Object.defineProperty(row, '__prov', { value: 'derived', enumerable: false });
      out.push(row);
    }
    return out;
  }
  map<U>(fn: (rows: Rows<T>, key: Record<string, unknown>) => U): Rows<U> {
    const out = new Rows<U>();
    for (const [k, members] of this.groups()) {
      const keyVals = JSON.parse(k) as unknown[];
      const key: Record<string, unknown> = {};
      this.keys.forEach((name, i) => (key[name] = keyVals[i]));
      const res = fn(rows(members), key);
      out.push(typeof res === 'object' && res !== null ? ({ ...key, ...res } as U) : res);
    }
    return out;
  }
}

/** Aggregated rows; `.keep('max')` retains a link from each group's extreme to its constituent. */
export class AggRows extends Rows<Record<string, unknown>> {
  keep(stat: 'max' | 'min'): AggRows {
    for (const row of this) {
      const members = (row as { __members?: unknown[] }).__members ?? [];
      for (const [field, cell] of Object.entries(row)) {
        if (!cell || typeof cell !== 'object' || !(stat in cell)) continue;
        const target = num((cell as Record<string, Value>)[stat]);
        const hit = members.find((m) => num(getPath(m, field)) === target);
        if (hit && isEnt(hit)) (cell as Record<string, Value>)[stat] = withValue((cell as Record<string, Value>)[stat], { source: hit.ref });
      }
    }
    return this;
  }
}
