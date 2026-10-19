import React, { useEffect, useRef } from "react";
import { wb } from "./wb.js";
import { useLab, Btn, Empty, cls } from "./common.jsx";
import { CODEGEN_VERSION } from "@kiln/kiln/std/records.js";
import { Val, valueVal, Row } from "./marks.jsx";

const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const isValue = (x) => x !== null && typeof x === "object" && x.__value === true;

// ----------------------------------------------------------------------------- Hypotheses (guide §29, §32.6)
// Every hypothesis of the project as a card, judged against the evidence store by evaluateHypotheses (wb.hypotheses).
// The notes render the same card for a ```hypothesis <id> fence.
export function HypothesesView() {
  useLab("compile", "store", "device", "sel", "measure");
  const box = useRef(null);
  const hs = wb.hypotheses, sel = wb.sel.hypothesis;
  useEffect(() => { if (sel) box.current?.querySelector(`[data-hyp="${CSS.escape(sel)}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" }); }, [sel, wb.version("sel")]);
  const counts = ["supported", "refuted", "open", "unqualified"].map((v) => [v, hs.filter((h) => h.verdict === v).length]).filter(([, n]) => n);
  const support = new Set(hs.flatMap((h) => h.support));
  return (
    <div className="page col">
      <div className="toolbar">
        <span className="lbl">{hs.length} {hs.length === 1 ? "hypothesis" : "hypotheses"}{counts.map(([v, n]) => ` · ${n} ${v}`).join("")}</span>
        <span className="sp" />
        <Btn sm onClick={() => wb.measure()} disabled={!wb.prog || !!wb.measuring} title={`Measure the compiled program on ${wb.device.label}; the verdicts update from the new records`}>{wb.measuring ? "Measuring…" : "Measure"}</Btn>
      </div>
      <div className="scroll" ref={box}>
        {hs.length ? hs.map((h) => <HypothesisCard key={h.id} h={h} selected={sel === h.id} />) : (
          <Empty>This project declares no hypotheses. A script adds one with <code>.hypothesis(id, h =&gt; h.claim(…).predicts(rows, predicate))</code>; W-05, W-19 and W-25 have examples.</Empty>
        )}
        <div className="titleblock">
          <div><label>project</label><b>{wb.preset ? `${wb.preset.id} ${wb.preset.title}` : "—"}</b></div>
          <div><label>device</label><b title={wb.evidenceId}>{wb.device.label} · {wb.evidenceId}</b></div>
          <div><label>support</label><b>{plural(support.size, "record")} read · {wb.store.list({ device: wb.evidenceId }).length} on this device</b></div>
          <div><label>code generator</label><b>{CODEGEN_VERSION}</b></div>
        </div>
      </div>
    </div>
  );
}

/** The card for one hypothesis id of the current project, for the notes; a missing id says so. */
export function NoteHypothesis({ id }) {
  useLab("compile", "store", "device", "sel");
  const h = wb.hypotheses.find((x) => x.id === id);
  if (!h) return <div className="hyp"><div className="hyp-h"><span className="stamp bad">no such hypothesis</span><span className="mono">{id || "(no id)"}</span></div><p className="note">The script declares {wb.project?._hypotheses.length ? wb.project._hypotheses.map((x) => x.id).join(", ") : "no hypotheses"}. A block names one: <code>```hypothesis {"<id>"}</code>.</p></div>;
  return <HypothesisCard h={h} inNotes />;
}

const VERDICT = {
  supported: { cls: "solid", text: "✓ supported" },
  refuted: { cls: "bad", text: "✕ refuted" },
  unqualified: { cls: "bad", text: "unqualified" },
  open: { cls: "", text: "open" },
};
const BASIS = { simulated: "simulated", measured: "measured", mixed: "simulated and measured", none: "no measurements" };

export function HypothesisCard({ h, selected = false, inNotes = false }) {
  const v = VERDICT[h.verdict] || VERDICT.open;
  const pred = wb.project?._hypotheses.find((x) => x.id === h.id)?._predicate;
  const basis = h.basis === "measured" ? `measured on ${wb.device.label}` : BASIS[h.basis] || h.basis;
  const showWhy = h.verdict !== "supported" && h.reasons.length;
  return (
    <section className={cls("hyp", selected && "sel")} data-hyp={h.id} aria-label={`hypothesis ${h.id}: ${h.verdict}`}>
      <div className="hyp-h">
        <span className={cls("stamp", v.cls)} title={h.reasons.join("\n") || "every row holds"}>{v.text}</span>
        <span className="stamp" title={`${plural(h.support.length, "supporting record")}`}>{basis}</span>
        <span className="mono dim">{h.id}</span>
        <span className="sp" />
        {inNotes ? <button type="button" className="link" onClick={() => { wb.select({ hypothesis: h.id }); wb.showView("hypotheses"); }}>in Hypotheses</button> : null}
      </div>
      <p className="hyp-claim">{h.claim || <span className="dim">No claim: add .claim(text).</span>}</p>
      {pred ? <Predicate fn={pred} /> : null}
      {h.rows.length ? <Rows h={h} /> : null}
      {showWhy ? <ul className={cls("reasons", (h.verdict === "refuted" || h.verdict === "unqualified") && "bad")}>{h.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul> : null}
      <dl className="hyp-meta">
        {h.alternatives.length ? <><dt>alternatives</dt><dd>{h.alternatives.length === 1 ? h.alternatives[0] : <ul>{h.alternatives.map((a, i) => <li key={i}>{a}</li>)}</ul>}</dd></> : null}
        {h.scope ? <><dt>scope</dt><dd>{h.scope}</dd></> : null}
        <dt>support</dt>
        <dd>{h.support.length ? <button type="button" className="link" onClick={() => { wb.select({ record: h.support[0] }); wb.showView("evidence"); }} title="Show the first supporting record in Evidence">{plural(h.support.length, "record")}</button> : "no records read"}</dd>
      </dl>
    </section>
  );
}

// The predicate as written: one line inline, a longer one as a block with its continuation lines dedented.
function Predicate({ fn }) {
  const lines = String(fn).split("\n");
  if (lines.length === 1) return <p className="hyp-pred"><span className="dim">predicts, per row</span> <code>{lines[0]}</code></p>;
  const cut = Math.min(...lines.slice(1).filter((l) => l.trim()).map((l) => l.match(/^\s*/)[0].length));
  const text = [lines[0], ...lines.slice(1).map((l) => l.slice(cut))].join("\n");
  return <div className="hyp-pred"><span className="dim">predicts, per row</span><pre className="hyp-src">{text}</pre></div>;
}

// The rows the predicate judged: the label fields (name, row, a, b) in one cell, every other field in its own
// column under its name, so a predicate's `r.hi` reads against the column "hi"; then the row's own result.
const LABELS = ["name", "row", "a", "b"], SKIP = new Set(["identity", "knobs"]);
function Rows({ h }) {
  const keys = [];
  for (const r of h.rows) for (const k of Object.keys(r)) if (!LABELS.includes(k) && !SKIP.has(k) && !keys.includes(k)) keys.push(k);
  const labelled = h.rows.some((r) => LABELS.some((k) => r[k] != null));
  return (
    <div className="hyp-rows">
      <table className="rt">
        <thead><tr>{labelled ? <th>row</th> : null}{keys.map((k) => <th key={k} className="num mono">{k}</th>)}<th>judged</th></tr></thead>
        <tbody>
          {h.rows.map((r, i) => {
            const c = h.checks[i];
            return (
              <tr key={i}>
                {labelled ? <td><Label r={r} /></td> : null}
                {keys.map((k) => <td key={k} className="num"><Cell x={r[k]} bounds={"lo" in r && "hi" in r} /></td>)}
                <td><Judged c={c} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
function Label({ r }) {
  return (
    <span className="hyp-label">
      {r.name != null ? <b>{r.name}</b> : null}
      {r.row != null ? <span className="rowtxt"><Row row={r.row} /></span> : null}
      {r.a != null ? <span className="rowtxt">a{"\u00a0=\u00a0"}<Row row={r.a} /></span> : null}
      {r.b != null ? <span className="rowtxt">b{"\u00a0=\u00a0"}<Row row={r.b} /></span> : null}
    </span>
  );
}
function Cell({ x, bounds }) {
  if (isValue(x)) return <Val v={valueVal(x, { ci: !bounds })} />;
  if (typeof x === "boolean") return x ? "yes" : "no";
  if (typeof x === "number") return Number.isFinite(x) ? +x.toPrecision(4) : "—";
  if (x == null) return <span className="dim">—</span>;
  return typeof x === "object" ? <span className="dim">…</span> : String(x);
}
function Judged({ c }) {
  if (!c) return <span className="dim">not judged</span>;
  if (c.pass === true) return <span className="okword">✓ holds</span>;
  if (c.pass === false) return <span className="bad">✕ fails</span>;
  const why = c.error ? `the predicate threw: ${c.error}` : c.missing.length ? `missing ${c.missing.join(", ")}` : "the predicate returned no decision (null, NaN or a missing value)";
  return <span className="dim" title={why}>undecided</span>;
}
