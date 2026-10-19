import { isLive, isParamRef } from './refs';
import { isEnt, rows, Rows, type DataSource, type EntityKind } from './rows';

export type QueryRoot =
  | { type: 'entities'; kind: EntityKind; pattern: unknown }
  | { type: 'runs'; pattern: unknown }
  | { type: 'read'; name: string }
  | { type: 'of'; entity: unknown };

export interface QueryOp {
  method: string;
  args: unknown[];
}

export interface QueryEnv {
  source: DataSource;
  /** Resolves ParamRefs and live lambdas in query arguments (view phase) or plan values. */
  resolveArg(arg: unknown): unknown;
  readDerive(name: string): unknown;
}

const describeArg = (a: unknown): string => {
  if (typeof a === 'function') return 'ƒ';
  if (a instanceof RegExp) return String(a);
  if (isParamRef(a)) return `param:${a.urlKey}`;
  if (isLive(a)) return 'live(ƒ)';
  if (isEnt(a)) return a.ref;
  if (typeof a === 'string') return `'${a}'`;
  // dataset('…') / archive('…') handles read as the call that made them
  if (a && typeof a === 'object' && typeof (a as { sha256?: unknown }).sha256 === 'string') {
    const t = a as { __dataset?: boolean; __archive?: boolean; sha256: string };
    if (t.__dataset || t.__archive) return `${t.__dataset ? 'dataset' : 'archive'}('${t.sha256.slice(0, 12)}…')`;
  }
  try {
    return JSON.stringify(a) ?? String(a);
  } catch {
    return String(a);
  }
};

const ROOT_NAME: Partial<Record<EntityKind, string>> = { alloc: 'allocs', batch: 'batches', graphgen: 'graphs' };

/** A lazy, composable query. Each operator records a method that is replayed on Rows at evaluation time. */
export class Query {
  readonly __query = true;
  constructor(
    readonly root: QueryRoot,
    readonly ops: QueryOp[] = [],
  ) {}
  private op(method: string, args: unknown[]): Query {
    return new Query(this.root, [...this.ops, { method, args }]);
  }
  where(fn: (row: never, i: number) => unknown) { return this.op('where', [fn]); }
  name(m: string | RegExp) { return this.op('name', [m]); }
  kind(...k: string[]) { return this.op('kind', k); }
  role(r: string) { return this.op('role', [r]); }
  phase(p: unknown) { return this.op('phase', [p]); }
  arm(a: unknown) { return this.op('arm', [a]); }
  warm() { return this.op('warm', []); }
  sort(k: unknown) { return this.op('sort', [k]); }
  top(n: unknown, k: unknown) { return this.op('top', [n, k]); }
  distinct(k: unknown) { return this.op('distinct', [k]); }
  pluck(k: unknown) { return this.op('pluck', [k]); }
  first() { return this.op('first', []); }
  one() { return this.op('one', []); }
  follow(...rels: string[]) { return this.op('follow', rels); }
  back(...rels: string[]) { return this.op('back', rels); }
  metric(n: string) { return this.op('metric', [n]); }
  sum(k?: unknown) { return this.op('sum', k === undefined ? [] : [k]); }
  groupBy(...keys: string[]) { return this.op('groupBy', keys); }
  agg(spec: unknown) { return this.op('agg', [spec]); }
  keep(stat: unknown) { return this.op('keep', [stat]); }
  map(fn: unknown) { return this.op('map', [fn]); }
  stats(k: unknown, s?: unknown) { return this.op('stats', s === undefined ? [k] : [k, s]); }

  /** Run patterns and derive names this query reads; used for IR input edges. */
  inputs(): { patterns: unknown[]; derives: string[] } {
    if (this.root.type === 'read') return { patterns: [], derives: [this.root.name] };
    if (this.root.type === 'of') return { patterns: [], derives: [] };
    return { patterns: [this.root.pattern], derives: [] };
  }

  describe(): string {
    const r = this.root;
    const head =
      r.type === 'entities'
        ? `q.${ROOT_NAME[r.kind] ?? `${r.kind}s`}(${describeArg(r.pattern)})`
        : r.type === 'runs'
          ? `q.runs(${describeArg(r.pattern)})`
          : r.type === 'read'
            ? `q.read('${r.name}')`
            : `q.of(${describeArg(r.entity)})`;
    return head + this.ops.map((o) => `.${o.method}(${o.args.map(describeArg).join(', ')})`).join('');
  }

  evaluate(env: QueryEnv): unknown {
    let cur: unknown;
    const r = this.root;
    if (r.type === 'entities') {
      const resolved = env.resolveArg(r.pattern);
      // a dataset handle (dataset('…')) names its entities by the dataset's manifest hash
      const pattern = resolved && typeof resolved === 'object' && typeof (resolved as { sha256?: unknown }).sha256 === 'string' ? (resolved as { sha256: string }).sha256 : resolved;
      cur = pattern ? rows(env.source.entities(r.kind, String(pattern))) : rows([]);
    } else if (r.type === 'runs') {
      const pattern = env.resolveArg(r.pattern);
      cur = pattern ? rows(env.source.runs(String(pattern))) : rows([]);
    } else if (r.type === 'read') {
      cur = env.readDerive(r.name);
      // a derive may return a plain array; queries over it still get the row operators
      if (Array.isArray(cur) && !(cur instanceof Rows)) cur = rows(cur);
    } else {
      const e = env.resolveArg(r.entity);
      cur = e ? rows([e]) : rows([]);
    }
    for (const { method, args } of this.ops) {
      if (cur === null || cur === undefined) return null;
      const resolved = args.map((a) => (typeof a === 'function' ? a : env.resolveArg(a)));
      const target = cur as Record<string, unknown>;
      if (typeof target[method] === 'function') {
        cur = (target[method] as (...a: unknown[]) => unknown)(...resolved);
      } else if ((method === 'one' || method === 'first') && !Array.isArray(cur)) {
        // a scalar derive result is already "one"
      } else {
        throw new TypeError(`cannot apply .${method}() to ${Array.isArray(cur) ? 'rows' : typeof cur} in ${this.describe()}`);
      }
    }
    return cur;
  }
}

export const isQuery = (x: unknown): x is Query => typeof x === 'object' && x !== null && (x as Query).__query === true;

const entities = (kind: EntityKind) => (pattern: unknown) => new Query({ type: 'entities', kind, pattern });

/** The `q` root given to programs. */
export const q = {
  runs: (pattern: unknown) => new Query({ type: 'runs', pattern }),
  requests: entities('request'),
  spans: entities('span'),
  kernels: entities('kernel'),
  tensors: entities('tensor'),
  allocs: entities('alloc'),
  instants: entities('instant'),
  batches: entities('batch'),
  graphs: entities('graphgen'),
  /** a dataset's images: q.images(dataset('<manifest sha256>')) */
  images: entities('image'),
  annotations: entities('annotation'),
  detections: entities('detection'),
  checks: entities('check'),
  read: (name: string) => new Query({ type: 'read', name }),
  of: (entity: unknown) => new Query({ type: 'of', entity }),
};

export { Rows };
