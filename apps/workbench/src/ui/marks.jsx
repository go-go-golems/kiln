// Where a number came from (guide §24, §32.3): the method strings, one value cell, one status stamp, and the
// lookups that turn (device, kernel identity, knobs) into what the evidence store knows. Every view that shows a
// kernel time builds its cells here, so the marks, words and titles stay the same everywhere.
import React from "react";
import { wb } from "./wb.js";
import { cls } from "./common.jsx";
import { knobs as KN } from "@kiln/kiln/core/kiln.js";
import { fmtUs, median } from "@kiln/kiln/core/util.js";
import { analyze, estimate } from "@kiln/kiln/std/tile.js";
import { CODEGEN_VERSION } from "@kiln/kiln/std/records.js";

const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** The §24 method strings: a value's title says how it was obtained. */
export const METHOD = {
  model: "analytic estimate: roofline + occupancy + waves (tile.js)",
  sim: (nb) => `timeModel over counts from ${nb ? plural(nb, "sampled block") : "sampled blocks"}`,
  counts: (nb, scale) => `SIMT simulation of ${plural(nb, "sampled block")}, scaled ×${+scale.toPrecision(3)} to the grid`,
  sample: (launches, kind) => `median of ${launches ? plural(launches, "timed launch") : "timed launches"} (${kind})`,
  stats: (n) => `median of ${plural(n, "repetition")}; 95 % bootstrap CI over repetitions`,
};

/** "MAP=tiled,BM=32" with a break opportunity after each comma, for narrow table cells. */
export const Row = ({ row }) => String(row).split(",").map((p, i, a) => <React.Fragment key={i}>{p}{i < a.length - 1 ? <>,<wbr /></> : null}</React.Fragment>);

export const shortId = (id, n = 12) => (id ? String(id).replace(/^sha256:/, "").slice(0, n) : "—");

// ----------------------------------------------------------------------------- the model's number
const modelCache = new WeakMap();
/** The cost model's estimate for a fork's loop kernel with `knobs` on the selected device: `{ us, flops, dram, … }`. */
export function modelOf(d, knobs) {
  const g = wb.run?.at("loop");
  const n = d && g?.nodes.get(d.node);
  if (!n || n.name !== "loop.kernel") return null;
  let m = modelCache.get(n);
  if (!m) modelCache.set(n, (m = new Map()));
  const key = KN.canonical(knobs) + "|" + wb.device.id;
  if (!m.has(key)) {
    try { const an = analyze(n.attrs.expr, n.attrs.shape, n.args.map((a) => g.nodes.get(a).type.shape)); m.set(key, estimate(an, knobs, wb.device.target)); } catch { m.set(key, null); }
  }
  return m.get(key);
}
export const modelUs = (d, knobs) => modelOf(d, knobs)?.us ?? null;

/** The schedule fork that decided a kernel (its key is the kernel identity). */
export const decisionOf = (identity) => wb.run?.decisions.findLast((d) => d.key === identity && d.knobs) ?? null;

// ----------------------------------------------------------------------------- what the store knows

/**
 * One option on one device: the pooled statistics of its decisive records (what decide.evidence reads), else its
 * newest record with that record's status, so a stale, partial or invalid measurement is shown rather than hidden.
 */
export function optionEvidence(device, identity, knobs) {
  if (!device) return null;
  const stats = wb.store.statsFor(device, identity, knobs);
  if (stats) return { stats, rec: stats.records.reduce((a, b) => (b.at > a.at ? b : a)), status: "fresh" };
  const want = KN.canonical(knobs);
  const rec = wb.store.list({ device, identity }).find((r) => KN.canonical(r.kernel.knobs) === want);
  return rec ? { stats: null, rec, status: wb.store.status(rec) } : null;
}

/** The simulator the "simulated" column reads: the selected device, else the simulator measured last. */
export function simRef() {
  if (wb.device.kind === "sim") return wb.device;
  const last = Object.values(wb.measures).filter((m) => m.device.startsWith("sim:")).sort((a, b) => b.t - a.t)[0];
  return wb.devices.find((d) => d.id === last?.device) || wb.devices.find((d) => d.kind === "sim");
}

/**
 * The hardware the "measured" column reads, as `{ id, name }`: the selected device when it is real and probed,
 * else the real device with the newest record of any of these kernel identities.
 */
export function hwRef(identities) {
  if (wb.device.kind !== "sim") return wb.device.evidenceId ? { id: wb.device.evidenceId, name: wb.device.label } : null;
  let best = null;
  for (const r of wb.store.records.values()) {
    if (r.device.class === "sim" || r.timing.kind === "legacy" || !identities.has(r.kernel.identity)) continue;
    if (!best || r.at > best.at) best = r;
  }
  return best ? { id: best.device.id, name: best.device.name } : null;
}

// ----------------------------------------------------------------------------- value descriptors
// A descriptor is { prov, text, ci?, n?, title, state? }; <Val> draws it as "mark number ±ci n=…".
// the CI as a suffix: "±0.4" when it is about symmetric, else "+140/−2.1" (a skewed interval is common: one slow
// repetition moves the upper bound only)
const p2 = (x) => +x.toPrecision(2);
const pm = (s) => {
  const up = s.hi - s.median, down = s.median - s.lo, h = Math.max(up, down);
  if (!(h > 0)) return null;
  return Math.abs(up - down) <= 0.25 * h ? `±${p2(h)}` : `+${p2(up)}/−${p2(down)}`;
};
const ciTitle = (s) => (s.hi > s.lo ? `\n95 % CI [${fmtUs(s.lo)}, ${fmtUs(s.hi)}]` : "");

export const missingVal = (why) => ({ prov: "unknown", text: "—", state: "missing", title: why });

export function modelVal(d, knobs) {
  const e = modelOf(d, knobs);
  if (!e) return missingVal("no cost model for this kernel's fork");
  if (!Number.isFinite(e.us)) return { prov: "heuristic", text: "infeasible", state: "missing", title: e.infeasible || "the model rejects this schedule" };
  return { prov: "heuristic", text: fmtUs(e.us), title: `model: ${METHOD.model}` };
}

const staleWhy = (r) => (r.manifest.codegen !== CODEGEN_VERSION
  ? `stale: generated by ${r.manifest.codegen}, the compiler is now ${CODEGEN_VERSION}`
  : `stale: measured code ${shortId(r.kernel.contentId)}, this option now compiles to ${shortId(wb.store.currentContentId(r.device.id, r.kernel.identity, r.kernel.row))}`);

/** Why a record has the status it has, in one line per reason. */
export function statusWhy(r) {
  const st = wb.store.status(r);
  if (st === "invalid") return "invalid: " + r.validity.reasons.join("; ");
  if (st === "stale") return staleWhy(r);
  if (st === "partial") return "partial (shown, never decides): " + r.validity.partial.join("; ");
  const c = r.check;
  return `valid: ${c.sampled} sampled outputs match the reference${c.maxAbsErr != null ? ` (max |err| ${c.maxAbsErr.toExponential(1)})` : ""}; ${r.timing.samples.length} of ${r.protocol.reps} repetitions; activation ${r.activation.ok ? "ok" : "failed"}`;
}

/** How a record's number was obtained (§24), from its timing kind and counts. */
export function methodOf(r, n = r.timing.samples.length) {
  if (r.timing.kind === "simulated") return METHOD.sim(r.counts?.sampledBlocks);
  if (r.timing.kind === "legacy") return "legacy kiln-evidence/1 row: one best time, no repetitions";
  return `${METHOD.stats(n)}; each repetition the ${METHOD.sample(r.timing.launches, r.timing.kind)}`;
}

/** The value cell of one option on one device; `src` is the source word ("simulated" or "measured"). */
export function evidenceVal(device, identity, knobs, { src, name = device } = {}) {
  const ev = optionEvidence(device, identity, knobs);
  if (!ev) return missingVal(`no ${src === "simulated" ? "simulation" : "measurement"} of this schedule on ${name || "any device"}`);
  const { stats: s, rec, status } = ev;
  const sim = rec.timing.kind === "simulated";
  if (s) {
    const prov = sim ? "heuristic" : s.n === 1 ? "observed" : "derived";
    return { prov, text: fmtUs(s.median), ci: sim ? null : pm(s), n: sim ? null : s.n, title: `${src} on ${rec.device.name}: ${methodOf(rec, s.n)}${s.records.length > 1 ? ` (${plural(s.records.length, "record")} pooled)` : ""}${sim ? "" : ciTitle(s)}${s.note ? `\n${s.note}` : ""}` };
  }
  if (status === "invalid") return { prov: "bad", text: "invalid", state: "missing", title: statusWhy(rec) };
  const n = rec.timing.samples.length;
  return { prov: sim ? "heuristic" : n === 1 ? "observed" : "derived", text: fmtUs(median(rec.timing.samples)), n: sim ? null : n, state: status === "stale" ? "stale" : null, title: `${statusWhy(rec)}\n${src} on ${rec.device.name}: ${methodOf(rec)}` };
}

/** One record's own number: the median of its samples, marked by its timing kind and status. */
export function recordVal(r) {
  const st = wb.store.status(r), n = r.timing.samples.length, sim = r.timing.kind === "simulated";
  return { prov: st === "invalid" ? "bad" : sim ? "heuristic" : n === 1 ? "observed" : "derived", text: n ? fmtUs(median(r.timing.samples)) : "—", n: sim ? null : n, state: st === "stale" ? "stale" : null, title: `${methodOf(r)}\n${statusWhy(r)}` };
}
export { median };

/** A value cell: mark, number, the CI as a small suffix, n. The title carries the method. */
export function Val({ v }) {
  if (!v) return null;
  return (
    <span className={cls("val", v.state)} title={v.title}>
      <i className={cls("prov", v.prov)} />{v.text}{v.ci ? <span className="ci">{v.ci}</span> : null}{v.n != null ? <span className="n">n={v.n}</span> : null}
    </span>
  );
}

/** The status of a record as a word: invalid (red), stale, partial (dashed stamps), or ✓ valid. */
export function StatusStamp({ rec }) {
  if (!rec) return null;
  const st = wb.store.status(rec), why = statusWhy(rec);
  if (st === "fresh") return <span className="okword" title={why}>✓ valid</span>;
  return <span className={cls("stamp", st === "invalid" && "bad")} title={why}>{st}</span>;
}

/**
 * Shared SVG definitions, rendered once by the app: `url(#half)` fills the simulator's half-filled chart marker
 * (`.ser.sim .mk`). A pattern in a display:none SVG does not paint, so this one is zero-sized instead.
 */
export function SvgDefs() {
  return (
    <svg className="svgdefs" width="0" height="0" aria-hidden="true" focusable="false">
      <defs><pattern id="half" width="1" height="1" patternContentUnits="objectBoundingBox"><rect width="1" height="1" fill="var(--bg)" /><rect width="0.5" height="1" fill="var(--ink)" /></pattern></defs>
    </svg>
  );
}
