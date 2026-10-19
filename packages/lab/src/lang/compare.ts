import type { DataSource, Ent } from './rows.ts';
import { getPath } from './util.ts';
import { derived, type Value } from './values.ts';

export class MatcherB {
  readonly __matcher = true;
  readonly keys: string[];
  constructor(keys: string[] = []) {
    this.keys = keys;
  }
  op() { return new MatcherB([...this.keys, 'op']); }
  layout() { return new MatcherB([...this.keys, 'layout']); }
  role() { return new MatcherB([...this.keys, 'role']); }
  code() { return new MatcherB([...this.keys, 'code']); }
  name() { return new MatcherB([...this.keys, 'name']); }
}

export const by = {
  op: () => new MatcherB(['op']),
  layout: () => new MatcherB(['layout']),
  role: () => new MatcherB(['role']),
  code: () => new MatcherB(['code']),
  name: () => new MatcherB(['name']),
};

export interface ComparePair {
  key: string;
  label: string;
  left: { dur: Value; count: number; refs: string[] };
  right: { dur: Value; count: number; refs: string[] };
  delta: Value;
}

export interface CompareResult {
  __compareResult: true;
  leftRun: string | null;
  rightRun: string | null;
  pairs: ComparePair[];
  unmatched: { left: { key: string; label: string; refs: string[] }[]; right: { key: string; label: string; refs: string[] }[] };
  excluded: { field: string; left: unknown; right: unknown }[];
  kind: string;
}

export class CompareB {
  readonly __compare = true;
  requireFields: string[] = [];
  matcher = new MatcherB(['op']);
  readonly left: unknown;
  readonly right: unknown;
  constructor(left: unknown, right: unknown) {
    this.left = left;
    this.right = right;
  }
  require(...fields: string[]) { this.requireFields.push(...fields); return this; }
  match(m: MatcherB) { this.matcher = m; return this; }
  describe(left: string, right: string) {
    return `compare(${left}, ${right}) · match by ${this.matcher.keys.join('+') || 'name'}`;
  }

  evaluate(source: DataSource, resolveArg: (x: unknown) => unknown): CompareResult {
    const pick = (pattern: unknown): Ent | null => {
      const p = String(resolveArg(pattern) ?? '');
      const runs = source.runs(p.includes('#') ? p : `${p}#*`);
      return runs.find((r) => String(r.ref).endsWith('#0')) ?? runs[0] ?? null;
    };
    const l = pick(this.left);
    const r = pick(this.right);
    const result: CompareResult = {
      __compareResult: true,
      leftRun: l?.ref ?? null,
      rightRun: r?.ref ?? null,
      pairs: [],
      unmatched: { left: [], right: [] },
      excluded: [],
      kind: 'structural match across runs — not one observed timeline',
    };
    if (!l || !r) return result;
    for (const field of this.requireFields) {
      const lv = getPath(l.manifest, field);
      const rv = getPath(r.manifest, field);
      if (JSON.stringify(lv) !== JSON.stringify(rv)) result.excluded.push({ field, left: lv, right: rv });
    }
    if (result.excluded.length) return result;
    const keys = this.matcher.keys.length ? this.matcher.keys : ['name'];
    const group = (run: Ent) => {
      const m = new Map<string, { label: string; dur: number; count: number; refs: string[] }>();
      for (const k of source.entities('kernel', `${run.ref}`)) {
        const parts = keys.map((key) => String(getPath(k, key) ?? '∅'));
        const key = parts.join(' · ');
        const g = m.get(key) ?? { label: String(k.op ?? k.name), dur: 0, count: 0, refs: [] };
        g.dur += Number(k.dur ?? 0);
        g.count += 1;
        if (g.refs.length < 64) g.refs.push(k.ref);
        m.set(key, g);
      }
      return m;
    };
    const lg = group(l);
    const rg = group(r);
    for (const [key, a] of lg) {
      const b = rg.get(key);
      if (!b) {
        result.unmatched.left.push({ key, label: a.label, refs: a.refs });
        continue;
      }
      result.pairs.push({
        key,
        label: a.label,
        left: { dur: derived(a.dur, { unit: 'ms', method: `sum of ${a.count}` }), count: a.count, refs: a.refs },
        right: { dur: derived(b.dur, { unit: 'ms', method: `sum of ${b.count}` }), count: b.count, refs: b.refs },
        delta: derived(b.dur - a.dur, { unit: 'ms', method: 'right − left' }),
      });
    }
    for (const [key, b] of rg) if (!lg.has(key)) result.unmatched.right.push({ key, label: b.label, refs: b.refs });
    result.pairs.sort((x, y) => Number(x.delta.value) - Number(y.delta.value));
    return result;
  }
}

export const compare = (left: unknown, right: unknown) => new CompareB(left, right);
export const isCompare = (x: unknown): x is CompareB => typeof x === 'object' && x !== null && (x as CompareB).__compare === true;
