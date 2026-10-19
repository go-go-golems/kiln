// The evidence context `ev` that hypothesis predicates read (guide §29.2), and the evaluation of a project's
// hypotheses. Every number is a Value with its provenance: the cost model's time is heuristic, a simulator's time
// is heuristic (it comes from a timing model), a hardware median is derived from observed repetitions. A missing
// measurement is a missing Value with the reason, never zero. Every call adds the records it read to the
// hypothesis's support: a fresh record that failed its checks makes the verdict unqualified.
import { combine, derived, heuristic, missing, pairedRatio, seal, verdict } from "@kiln/evidence";
import { knobs as KN } from "../core/kiln.js";
import { analyze, estimate, canonRow } from "./tile.js";

const PROV = (deterministic) => (deterministic ? "heuristic" : "derived");
const METHOD = {
  model: "analytic estimate: roofline + occupancy + waves (tile.js)",
  sim: "timeModel over counts from sampled blocks (simulator)",
  hw: (s) => `median of ${s.n} repetition${s.n === 1 ? "" : "s"}; 95 % bootstrap CI over repetitions`,
};

/** A row filter: "MAP=row,TPB=128" or { MAP: "row" }; a knob set matches when it has every listed value. */
const filterOf = (spec) => (typeof spec === "string" ? KN.parse(spec) : { ...(spec || {}) });
const matches = (knobs, f) => Object.entries(f).every(([k, v]) => String(knobs?.[k]) === String(v));
// a side's row with the filter's knobs that the short row leaves out (canonRow drops defaults: MAP=thread → "TPB=128")
const sideRow = (row, f) => {
  const shown = KN.parse(row);
  return [...Object.entries(f).filter(([k]) => !(k in shown)).map(([k, v]) => `${k}=${v}`), row].filter(Boolean).join(",");
};

/**
 * The evidence context for one compiled program on one device.
 *   store     an EvidenceStore
 *   prog      programOf(run.graph) (null when the program has no kernels)
 *   device    the device id the records carry (wb.evidenceId)
 *   target    the device's target spec, for the model's estimate
 * Returns `{ ev, support }`; `support` is the Map (record id → record) of everything the calls read.
 */
export function evidenceContext({ store, prog, device, target }) {
  const support = new Map();
  const read = (recs) => { for (const r of recs) support.set(r.id, r); };
  const kernel = (name) => {
    const kern = prog?.kernels.find((x) => x.name === name || x.identity === name);
    if (!kern) throw new Error(`ev: no kernel "${name}" in this program (${prog ? prog.kernels.map((x) => x.name).join(", ") : "no GPU kernels"})`);
    return kern;
  };
  const modelUs = (kern, knobs) => { try { return estimate(analyze(kern.expr, kern.shape, kern.inShapes), knobs, target).us; } catch { return NaN; } };
  // every non-stale record of an option is support (an invalid one makes the verdict unqualified); only the
  // decisive ones enter the statistics
  const statsOf = (dev, identity, knobs) => {
    const want = KN.canonical(knobs);
    read(store.list({ device: dev, identity }).filter((r) => KN.canonical(r.kernel.knobs) === want && !store.isStale(r) && (r.validity.ok === false || store.isDecisive(r))));
    return store.statsFor(dev, identity, knobs);
  };
  const timeOf = (s, what) => {
    if (!s) return { time: missing(`no measurement of ${what} on ${device}`, { unit: "us" }), lo: missing("no measurement"), hi: missing("no measurement"), n: 0 };
    const prov = PROV(s.deterministic), method = s.deterministic ? METHOD.sim : METHOD.hw(s);
    const mk = prov === "heuristic" ? heuristic : derived;
    return { time: mk(s.median, { unit: "us", method, ci: [s.lo, s.hi], n: s.n, source: device }), lo: mk(s.lo, { unit: "us", method }), hi: mk(s.hi, { unit: "us", method }), n: s.n };
  };

  const ev = {
    /** One row per kernel of the current program: name, identity, row, model, time, lo, hi, n. */
    kernels({ device: dev = device } = {}) {
      return (prog?.kernels || []).map((kern) => ({
        name: kern.name, identity: kern.identity, row: kern.row,
        model: heuristic(modelUs(kern, kern.map), { unit: "us", method: METHOD.model }),
        ...timeOf(statsOf(dev, kern.identity, kern.map), `${kern.name} ${kern.row}`),
      }));
    },
    /** One row per measured schedule option of a kernel: row, knobs, model, time, lo, hi, n, chosen. */
    options(name, { device: dev = device } = {}) {
      const kern = kernel(name);
      const seen = new Map();
      for (const r of store.list({ device: dev, identity: kern.identity })) if (store.isDecisive(r)) seen.set(KN.canonical(r.kernel.knobs), r.kernel.knobs);
      return [...seen.values()].map((knobs) => ({
        row: canonRow(knobs), knobs, model: heuristic(modelUs(kern, knobs), { unit: "us", method: METHOD.model }),
        ...timeOf(statsOf(dev, kern.identity, knobs), `${kern.name} ${canonRow(knobs)}`), chosen: canonRow(knobs) === kern.row,
      }));
    },
    /**
     * time(b) / time(a) for one kernel, where each side is the fastest measured option matching a knob filter
     * ("MAP=row" or { MAP: "row" }). Paired when the two sides' records share a pairId (one protocol run), else a
     * ratio of medians with a conservative interval (b.lo / a.hi, b.hi / a.lo).
     */
    ratio(name, { a, b, device: dev = device } = {}) {
      const kern = kernel(name);
      const fa = filterOf(a), fb = filterOf(b);
      const pick = (f) => {
        let best = null;
        for (const r of store.list({ device: dev, identity: kern.identity })) {
          if (!store.isDecisive(r) || !matches(r.kernel.knobs, f)) continue;
          const s = statsOf(dev, kern.identity, r.kernel.knobs);
          if (s && (!best || s.median < best.median)) best = { ...s, row: r.kernel.row };
        }
        return best;
      };
      const A = pick(fa), B = pick(fb);
      const label = (f) => canonRow(f) || KN.canonical(f);
      if (!A || !B) {
        const why = `no measurement of ${!A ? label(fa) : label(fb)} for ${kern.name} on ${dev}`;
        return { ratio: missing(why), lo: missing(why), hi: missing(why), n: 0, paired: false, a: A ? sideRow(A.row, fa) : label(fa), b: B ? sideRow(B.row, fb) : label(fb) };
      }
      const prov = combine(PROV(A.deterministic), PROV(B.deterministic));
      const mk = prov === "heuristic" ? heuristic : derived;
      const pa = new Map(A.records.flatMap((r) => (r.protocol.pairId ? [[r.protocol.pairId, r]] : [])));
      const shared = B.records.map((rb) => [pa.get(rb.protocol.pairId), rb]).filter(([ra]) => ra);
      if (shared.length) {
        const pairs = shared.flatMap(([ra, rb], j) => ra.timing.samples.map((x, i) => ({ rep: j * 1e4 + i, a: x, b: rb.timing.samples[i] })).filter((p) => Number.isFinite(p.b)));
        const s = pairedRatio(pairs);
        if (s.median !== null) {
          const opts = { method: s.method, ci: s.ci, n: s.n };
          return { ratio: mk(s.median, opts), lo: mk(s.ci[0], opts), hi: mk(s.ci[1], opts), n: s.n, paired: true, a: sideRow(A.row, fa), b: sideRow(B.row, fb) };
        }
      }
      const method = "ratio of medians, unpaired; interval from the two medians' intervals (conservative)";
      const lo = B.lo / A.hi, hi = B.hi / A.lo;
      return { ratio: mk(B.median / A.median, { method, ci: [lo, hi], n: Math.min(A.n, B.n) }), lo: mk(lo, { method }), hi: mk(hi, { method }), n: Math.min(A.n, B.n), paired: false, a: sideRow(A.row, fa), b: sideRow(B.row, fb) };
    },
    /** The program's time: the sum of kernel medians (provenance: the weakest part; interval: the sum of bounds). */
    total({ device: dev = device } = {}) {
      const rows = ev.kernels({ device: dev });
      if (!rows.length) return { total: missing("no GPU kernels"), lo: missing("no GPU kernels"), hi: missing("no GPU kernels"), n: 0 };
      const gone = rows.find((r) => r.time.value === null);
      if (gone) return { total: missing(`${gone.name}: ${gone.time.reason}`), lo: missing(gone.time.reason), hi: missing(gone.time.reason), n: 0 };
      const prov = combine(...rows.map((r) => r.time));
      const mk = prov === "heuristic" ? heuristic : derived;
      const sum = (f) => rows.reduce((acc, r) => acc + r[f].value, 0);
      const method = `sum of ${rows.length} kernel medians`;
      return { total: mk(sum("time"), { unit: "us", method }), lo: mk(sum("lo"), { unit: "us", method }), hi: mk(sum("hi"), { unit: "us", method }), n: Math.min(...rows.map((r) => r.n)) };
    },
    /** Raw records, read-only. */
    records(filter = {}) { const recs = store.list({ device, ...filter }); read(recs); return seal(recs); },
  };
  return { ev, support };
}

/**
 * Evaluate every hypothesis of a project against the store. Each result:
 * `{ id, claim, alternatives, scope, verdict, reasons, checks, rows, support: [record ids], basis, error }`,
 * where `basis` says what the support was measured on: "simulated", "measured", "mixed" or "none".
 */
export function evaluateHypotheses(project, { store, prog, device, target }) {
  return (project?._hypotheses || []).map((h) => {
    const { ev, support } = evidenceContext({ store, prog, device, target });
    const base = { id: h.id, claim: h._claim, alternatives: h._alternatives, scope: h._scope };
    let rows;
    try {
      const out = h._rows ? h._rows(ev) : null;
      rows = out == null ? [] : Array.isArray(out) ? out : [out];
    } catch (e) {
      return { ...base, verdict: "open", reasons: [`the rows threw: ${e.message}`], checks: [], rows: [], support: [...support.keys()], basis: basisOf(support), error: e.message };
    }
    if (!h._predicate) return { ...base, verdict: "open", reasons: ["no prediction: add .predicts(rows, predicate)"], checks: [], rows, support: [...support.keys()], basis: basisOf(support), error: null };
    const v = verdict({ rows, predicate: h._predicate, support: [...support.values()] });
    return { ...base, verdict: v.verdict, reasons: v.reasons, checks: v.checks, rows, support: [...support.keys()], basis: basisOf(support), error: null };
  });
}

function basisOf(support) {
  const kinds = new Set([...support.values()].map((r) => (r.timing.kind === "simulated" ? "simulated" : "measured")));
  return kinds.size === 0 ? "none" : kinds.size === 2 ? "mixed" : [...kinds][0];
}

/** The builder a project script's `.hypothesis(id, h => h.claim(…).predicts(…)…)` configures. */
export class Hypothesis {
  constructor(id) { this.id = id; this._claim = ""; this._rows = null; this._predicate = null; this._alternatives = []; this._scope = ""; }
  claim(text) { this._claim = String(text); return this; }
  /** rows(ev) → a row or an array of rows; predicate(row) → boolean or Value, judged per row (guide §29.3). */
  predicts(rows, predicate) { this._rows = rows; this._predicate = predicate; return this; }
  alternatives(...texts) { this._alternatives.push(...texts.flat().map(String)); return this; }
  scope(text) { this._scope = String(text); return this; }
}
