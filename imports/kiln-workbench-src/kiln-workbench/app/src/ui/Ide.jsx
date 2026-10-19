import React, { useEffect, useMemo, useRef, useState } from "react";
import { wb, REFERENCE, GUIDELINES } from "./wb.js";
import { useLab, Btn, cls } from "./common.jsx";
import { highlightLines } from "./highlight.js";
import { Tensor, summarize } from "../core/util.js";
import { ParamControl, paramGroups } from "./Knobs.jsx";

export function CodePane() {
  useLab("code", "diags", "compile", "preset", "params");
  const [open, setOpen] = useState(true);
  const lines = wb.script.split("\n").length;
  const errs = wb.diags.filter((d) => d.level === "error"), warns = wb.diags.filter((d) => d.level === "warn");
  const run = wb.run;
  const G = wb.project ? paramGroups() : { program: [], pipeline: [], knobs: [] };
  const params = [...G.program, ...G.pipeline];
  return (
    <div className="srcpane">
      <Editor />
      {wb.diags.length ? (
        <div className="diags">
          {[...errs, ...warns].slice(0, 6).map((d, i) => (
            <button key={i} type="button" className={cls("diag", d.level === "error" && "bad")} onClick={() => d.line && wb.bump("gotoLine", (wb.gotoLine = d.line))}>
              <b>{d.level === "error" ? "✕" : "!"}</b>{d.line ? <span className="ln">line {d.line}</span> : null}<span>{d.message}</span>
            </button>
          ))}
          {errs.length + warns.length > 6 ? <span className="note">and {errs.length + warns.length - 6} more</span> : null}
        </div>
      ) : null}
      {params.length || G.knobs.length ? (
        <div className="params">
          <header><h2>Parameters</h2><span className="sp" /><span className="note">changes recompile</span></header>
          {G.program.map((p) => <ParamControl key={p.name} p={p} />)}
          {G.pipeline.length ? <div className="psub">pipeline</div> : null}
          {G.pipeline.map((p) => <ParamControl key={p.name} p={p} />)}
          {G.knobs.length ? <div className="psub">knobs (forks this project's passes offer: auto, or pin one value)</div> : null}
          {G.knobs.map((p) => <ParamControl key={p.name} p={p} knob />)}
        </div>
      ) : null}
      <Checks open={open} setOpen={setOpen} />
      <div className="ed-foot">
        <span><b>{lines}</b> lines</span>
        {run ? <><span>·</span><span><b>{run.steps.filter((s) => s.kind === "rewrite").length}</b> rewrites</span><span>·</span><span><b>{run.decisions.length}</b> forks</span><span>·</span><span><b>{wb.prog ? wb.prog.kernels.length : run.graph.size}</b> {wb.prog ? "kernels" : "nodes"}</span></> : null}
        <span className="sp" />
        {errs.length ? <span className="bad">{errs.length} error{errs.length > 1 ? "s" : ""}</span> : <span>{wb.script !== wb.savedScript ? "edited" : "saved"}</span>}
      </div>
    </div>
  );
}

function Editor() {
  useLab("code", "diags", "gotoLine");
  const ta = useRef(null), pre = useRef(null), gut = useRef(null);
  const hl = useMemo(() => highlightLines(wb.script), [wb.script]);
  const errLines = new Set(wb.diags.filter((d) => d.level === "error" && d.line).map((d) => d.line));
  const warnLines = new Set(wb.diags.filter((d) => d.level === "warn" && d.line).map((d) => d.line));
  useEffect(() => {
    const t = ta.current;
    if (!t || !wb.gotoLine) return;
    const lines = wb.script.split("\n");
    const pos = lines.slice(0, wb.gotoLine - 1).join("\n").length + (wb.gotoLine > 1 ? 1 : 0);
    t.focus(); t.setSelectionRange(pos, pos + (lines[wb.gotoLine - 1] || "").length);
    t.scrollTop = Math.max(0, (wb.gotoLine - 6) * 18);
    wb.gotoLine = null;
  }, [wb.version("gotoLine")]);
  const sync = () => {
    const t = ta.current;
    if (pre.current) pre.current.style.transform = `translate(${-t.scrollLeft}px, ${-t.scrollTop}px)`;
    if (gut.current) gut.current.style.transform = `translateY(${-t.scrollTop}px)`;
  };
  const onKey = (e) => {
    const t = e.currentTarget;
    if (e.key === "Tab") {
      e.preventDefault();
      const { selectionStart: a, selectionEnd: b, value } = t;
      wb.setScript(value.slice(0, a) + "  " + value.slice(b));
      requestAnimationFrame(() => t.setSelectionRange(a + 2, a + 2));
    } else if ((e.metaKey || e.ctrlKey) && (e.key === "s" || e.key === "S")) { e.preventDefault(); wb.savePreset(); }
  };
  useEffect(sync);
  return (
    <div className="ed">
      <div className="gutter"><div className="gutter-in" ref={gut}>{hl.map((_, i) => <div key={i} className={errLines.has(i + 1) ? "err" : warnLines.has(i + 1) ? "warn" : ""}>{i + 1}</div>)}</div></div>
      <div className="code">
        <pre ref={pre} aria-hidden="true">{hl.map((h, i) => <div key={i} className={errLines.has(i + 1) ? "ln-err" : ""} dangerouslySetInnerHTML={{ __html: h || " " }} />)}</pre>
        <textarea ref={ta} value={wb.script} spellCheck={false} autoCapitalize="off" autoCorrect="off" aria-label="Project script" onChange={(e) => wb.setScript(e.target.value)} onScroll={sync} onKeyDown={onKey} />
      </div>
    </div>
  );
}

const fmtVal = (v) => (v instanceof Tensor ? `tensor(${v.shape.join("×") || "scalar"}) [${v.preview(5).join(", ")}${v.size > 5 ? ", …" : ""}]` : typeof v === "number" ? String(+v.toPrecision(7)) : summarize(v, 100));
function Checks({ open, setOpen }) {
  useLab("compile", "measure");
  const e = wb.e2e;
  const m = wb.measures[wb.deviceId];
  const kernBad = m ? m.kernels.filter((x) => x.error || x.check?.ok === false) : [];
  const status = !e ? "" : e.error ? "error" : e.ok === false ? "fail" : e.skipped ? "skipped" : e.ok ? "pass" : "fail";
  return (
    <div className={cls("params scen", !open && "closed")}>
      <header>
        <button type="button" className="linkhd" onClick={() => setOpen(!open)} aria-expanded={open}><h2>Checks</h2></button>
        {status === "pass" ? <span className="ok">reference ✓</span> : status === "fail" || status === "error" ? <span className="bad">{e?.skipped ? "checks ✕" : "reference ✕"}</span> : status === "skipped" ? <span className="note">reference skipped</span> : null}
        {m ? (kernBad.length ? <span className="bad">{kernBad.length} kernel{kernBad.length > 1 ? "s" : ""} ✕</span> : <span className="ok">{m.kernels.length} kernel{m.kernels.length > 1 ? "s" : ""} ✓</span>) : null}
        <span className="sp" />
        <Btn sm onClick={() => wb.compile()}>Run</Btn>
      </header>
      {open ? (
        <div className="checks">
          {!e ? <p className="empty padded">Compile to check the program.</p> : e.error ? <div className="srow bad"><div className="srow-msg">{e.error}</div></div> : (
            <>
              {e.skipped ? <p className="note padded">End-to-end check skipped: {e.skipped}.</p> : null}
              {(e.checks || []).map((c) => (
                <div key={c.name} className={cls("srow", !c.ok && "bad")}>
                  <div className="srow-h"><span className="linkhd">output <b>{c.name}</b>: the {e.level} IR vs the frontend reference</span><span className="sp" /><span className="st">{c.ok ? "✓" : "✕"}</span></div>
                  <div className={c.ok ? "note" : "srow-msg"}>{c.message}</div>
                </div>
              ))}
              {(e.custom || []).map((c) => (
                <div key={c.name} className={cls("srow", !c.ok && "bad")}>
                  <div className="srow-h"><span className="linkhd">{c.name}</span><span className="sp" /><span className="st">{c.ok ? "✓" : "✕"}</span></div>
                  {c.ok ? (c.info || c.skipped ? <div className="note">{c.message}</div> : null) : <div className="srow-msg">{c.message}</div>}
                </div>
              ))}
              {wb.outputs ? <div className="srow"><div className="note">{Object.entries(wb.outputs.got).map(([k2, v]) => <div key={k2}><b>{k2}</b> = {fmtVal(v)}</div>)}</div></div> : null}
            </>
          )}
          {kernBad.map((x) => <div key={x.name} className="srow bad"><div className="srow-h"><span className="linkhd">{x.name} on {m.deviceName}</span></div><div className="srow-msg">{x.error || x.check.message}</div></div>)}
        </div>
      ) : null}
    </div>
  );
}

export function Reference() {
  const parts = REFERENCE.split(/\n(?=## )/);
  return (
    <div className="scroll">
      <div className="ref">
        <h3>kiln · the API</h3>
        {parts.map((p, i) => {
          if (!p.startsWith("## ")) return <div key={i}>{p}</div>;
          const nl = p.indexOf("\n");
          return <React.Fragment key={i}><h3>{p.slice(3, nl)}</h3><div>{p.slice(nl + 1)}</div></React.Fragment>;
        })}
        <h3>The agent's guidelines</h3>
        <div>{GUIDELINES}</div>
      </div>
    </div>
  );
}
