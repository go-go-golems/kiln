// The verdict of a lab program's hypothesis, headless. Perf Lab computed it inside its React view
// (HypothesisView.tsx L19-48, P-8); here it is a pure function of a build and its state, and the verdict itself is
// @kiln/evidence's `verdict` (guide §29.3), so the board, the agent and the check script agree:
// - rows: the prediction query's result, materialized against the build's data source;
// - predicate: the program's `predicts(query, fn)` function;
// - support: the runs behind every `supportedBy(...)` query's entities, with their validity.
// What changed against Perf Lab: a predicate that throws leaves its row undecided (open) instead of refuting; a row
// whose predicate read a missing field is undecided even when the predicate returned true; a predicate may return
// null (evidence's three-valued `below`/`above`) to leave a row undecided.
import { verdict, type Check, type SupportRecord, type Verdict } from '@kiln/evidence';
import type { HypothesisB } from './builders.ts';
import { isQuery } from './query.ts';
import { isEnt } from './rows.ts';
import { materialize, type BuildRegistry, type RuntimeState } from './runtime.ts';

export type { Verdict } from '@kiln/evidence';

export interface HypothesisSupport {
  /** the supportedBy query, as text */
  describe: string;
  /** rows it returned */
  count: number;
  /** runs of the entities among them */
  runs: string[];
  /** those runs that are not valid (or not found) */
  invalid: string[];
}

export interface HypothesisResult {
  id: string;
  h: HypothesisB;
  claim: string;
  verdict: Verdict;
  /** one per prediction row: pass true (supports), false (clean counterexample) or null (undecided) */
  checks: Check<Record<string, unknown>>[];
  /** why the verdict is not `supported`: invalid runs, missing fields, predicate errors, counterexample rows */
  reasons: string[];
  support: HypothesisSupport[];
  /** set when the prediction or a support query could not be evaluated; the verdict is then `open` */
  error?: string;
}

const asRows = (v: unknown): Record<string, unknown>[] => {
  if (v === null || v === undefined) return [];
  if (Array.isArray(v)) return v as Record<string, unknown>[];
  // a query ending in .one()/.first(), or a derive that returns one object, is one row
  if (typeof v === 'object') return [v as Record<string, unknown>];
  throw new TypeError(`the prediction query returned a ${typeof v}, not rows`);
};

const validityOf = (x: unknown): SupportRecord['validity'] => {
  if (!x || typeof x !== 'object') return undefined;
  const v = x as { ok?: unknown; reasons?: unknown };
  return { ok: v.ok === true, reasons: Array.isArray(v.reasons) ? v.reasons.map(String) : [] };
};

/** Judge one hypothesis of a build. Throws only for an unknown id. */
export function evaluateHypothesis(reg: BuildRegistry, state: RuntimeState, id: string): HypothesisResult {
  const h = reg.hypotheses.get(id);
  if (!h) throw new Error(`unknown hypothesis "${id}"`);
  const base = { id, h, claim: h.claimText };
  const fail = (what: string, e: unknown, support: HypothesisSupport[]): HypothesisResult => {
    const error = `${what}: ${e instanceof Error ? e.message : String(e)}`;
    return { ...base, verdict: 'open', checks: [], reasons: [error], support, error };
  };

  const support: HypothesisSupport[] = [];
  const records: SupportRecord[] = [];
  for (const s of h.support) {
    const describe = isQuery(s) ? s.describe() : String(s);
    let v: unknown;
    try {
      v = isQuery(s) ? materialize(reg, s, state) : [];
    } catch (e) {
      return fail(`support query ${describe} failed`, e, support);
    }
    const list = Array.isArray(v) ? v : [];
    const runs = [...new Set(list.filter(isEnt).map((e) => String(e.run)))];
    const invalid: string[] = [];
    for (const ref of runs) {
      const validity = validityOf(reg.source.entity(ref)?.validity);
      if (!validity?.ok) invalid.push(ref);
      records.push(validity ? { id: ref, validity } : { id: ref });
    }
    support.push({ describe, count: list.length, runs, invalid });
  }

  let rows: Record<string, unknown>[] = [];
  if (h.prediction) {
    try {
      rows = asRows(materialize(reg, h.prediction.query, state));
    } catch (e) {
      return fail('the prediction query failed', e, support);
    }
  }
  const predicate = h.prediction?.fn ?? (() => null);
  const r = verdict({ rows, predicate, support: records });
  return { ...base, verdict: r.verdict, checks: r.checks, reasons: r.reasons, support };
}

/** Every hypothesis of a build, in declaration order. */
export const evaluateHypotheses = (reg: BuildRegistry, state: RuntimeState): HypothesisResult[] =>
  [...reg.hypotheses.keys()].map((id) => evaluateHypothesis(reg, state, id));
