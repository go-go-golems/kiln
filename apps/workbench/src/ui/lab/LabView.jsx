// The Lab view (guide §33): pick a lab program, see whether it built, where its data comes from, its boards (each
// opens as a dock view of its own) and every hypothesis with its verdict.
import React, { useMemo } from "react";
import { wb } from "../wb.js";
import { useLab, Btn, cls } from "../common.jsx";
import { labs } from "./state.js";
import { evaluateHypothesis } from "./api.js";

const VERDICT = { supported: ["solid", "✓ supported"], refuted: ["bad", "✕ refuted"], open: ["", "open"], unqualified: ["bad", "unqualified"] };

export function LabView() {
  useLab("lab");
  const cur = labs.current;
  const groups = [...new Set(labs.programs.map((p) => p.group))];
  return (
    <div className="page col lab-home">
      <div className="scroll">
        <header className="detail-h">
          <h2>{cur ? cur.title : "Lab programs"}</h2>
          <p className="sub">{cur ? `${cur.ir ? `${cur.ir.boards.length} boards · ${cur.ir.hypotheses?.length ?? labs.hypotheses().length} hypotheses` : "did not build"} · ${labs.dataLine()}` : "Perf Lab's programs: experiments, derives, boards and hypotheses. Pick one to build it."}</p>
        </header>
        {cur?.error ? <p className="lab-err" role="alert">{cur.error}</p> : null}
        {cur?.ir ? <Boards cur={cur} /> : null}
        {cur?.ir ? <Verdicts cur={cur} /> : null}
        {groups.map((g) => (
          <section key={g} aria-label={g}>
            <h3 className="lab-grp">{g}</h3>
            <div className="lab-progs">
              {labs.programs.filter((p) => p.group === g).map((p) => (
                <button key={p.id} type="button" className={cls(cur?.id === p.id && "on")} onClick={() => labs.open(p.id)} aria-pressed={cur?.id === p.id}>
                  <b>{p.name}</b><small>{p.description}</small><small className="mono">{p.id}.lab.js</small>
                </button>
              ))}
            </div>
          </section>
        ))}
        {cur ? <details className="lab-srcbox"><summary>Program source · {cur.id}.lab.js</summary><pre className="code">{cur.source}</pre></details> : null}
      </div>
    </div>
  );
}

function Boards({ cur }) {
  return (
    <section aria-label="Boards">
      <div className="lab-sechead"><h3>Boards</h3><Btn sm onClick={() => cur.ir.boards.forEach((b) => wb.showView(`board:${b.id}`))}>Open all</Btn></div>
      <table className="rt lab-boards">
        <thead><tr><th>board</th><th>experiments</th><th className="num">params</th><th /></tr></thead>
        <tbody>
          {cur.ir.boards.map((b) => (
            <tr key={b.id} className="clickable" onClick={() => wb.showView(`board:${b.id}`)}>
              <td><b>{b.title || b.id}</b><br /><span className="mono dim">{b.id}</span></td>
              <td className="mono">{b.experiments.join(", ") || "—"}</td>
              <td className="num">{b.paramKeys.length}</td>
              <td><button type="button" className="link" onClick={(e) => { e.stopPropagation(); wb.showView(`board:${b.id}`); }}>open</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Verdicts({ cur }) {
  const rows = useMemo(() => labs.hypotheses().map((id) => {
    try { const v = evaluateHypothesis(cur.reg, cur.state, id); return { id, verdict: v.verdict, claim: v.h.claimText, n: v.checks.length, reasons: v.reasons ?? [] }; }
    catch (e) { return { id, verdict: "open", claim: "", n: 0, reasons: [`could not evaluate: ${e.message}`] }; }
  }), [cur.reg, cur.state]);
  if (!rows.length) return null;
  return (
    <section aria-label="Hypotheses">
      <div className="lab-sechead"><h3>Hypotheses</h3></div>
      <table className="rt">
        <thead><tr><th>verdict</th><th>hypothesis</th><th className="num">rows</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td><span className={cls("stamp", VERDICT[r.verdict]?.[0])} title={r.reasons.join("\n") || undefined}>{VERDICT[r.verdict]?.[1] ?? r.verdict}</span></td>
              <td><span className="mono dim">{r.id}</span><br />{r.claim}</td>
              <td className="num">{r.n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
