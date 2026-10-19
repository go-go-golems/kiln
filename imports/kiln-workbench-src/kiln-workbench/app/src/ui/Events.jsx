import React, { useEffect, useRef, useState } from "react";
import { wb } from "./wb.js";
import { useLab, Seg, Tog, Empty, cls } from "./common.jsx";

// Two logs: the workbench's (compiles, measurements, tuning, pins, the agent) and the last compile's
// own event stream (pass starts and ends, rewrites, declines, forks and decisions).
const COMPILE_KINDS = { all: null, passes: new Set(["passStart", "passEnd", "ir", "runStart", "runEnd"]), rewrites: new Set(["rewrite"]), declined: new Set(["skip"]), forks: new Set(["fork", "decided"]), errors: new Set(["error"]) };
const evText = (e) => {
  switch (e.kind) {
    case "rewrite": return `${e.pass}/${e.rule} at ${e.node} → step ${e.step}`;
    case "skip": return `${e.pass}/${e.rule} at ${e.node} declined: ${e.text}`;
    case "fork": return `${e.pass}/${e.rule} at ${e.node}: ${e.options} options`;
    case "decided": { const d = e.decision; return `${d.rule} at ${d.node}: ${d.knobs ? Object.entries(d.knobs).map(([a, b]) => `${a}=${b}`).join(",") : "none"} by ${d.by}`; }
    case "passStart": return e.pass;
    case "passEnd": return `${e.pass}: ${e.applied} rewrites in ${e.ms.toFixed(1)} ms`;
    case "ir": return `checkpoint ${e.ir}: ${e.nodes} nodes`;
    case "runStart": return `${e.graph}: ${e.nodes} nodes in`;
    case "runEnd": return `${e.ok ? "ok" : "failed"} after ${e.steps} steps, ${e.ms.toFixed(0)} ms`;
    default: return e.text || "";
  }
};

export function EventsView() {
  useLab("events", "compile");
  const [src, setSrc] = useState("wb");
  const [kind, setKind] = useState("all");
  const [q, setQ] = useState("");
  const [follow, setFollow] = useState(true);
  const box = useRef(null);
  useEffect(() => { if (follow && box.current) box.current.scrollTop = box.current.scrollHeight; });
  const needle = q.trim().toLowerCase();
  let rows;
  if (src === "wb") rows = wb.events.map((e) => ({ t: new Date(e.t).toLocaleTimeString(), kd: e.kind, s: e.text, bad: e.bad || e.kind === "error" }));
  else {
    const set = COMPILE_KINDS[kind];
    rows = (wb.run?.events || []).filter((e) => !set || set.has(e.kind)).map((e) => ({ t: e.t.toFixed(1) + " ms", kd: e.kind, s: evText(e), bad: e.kind === "error", step: e.step }));
  }
  if (needle) rows = rows.filter((r) => `${r.kd} ${r.s}`.toLowerCase().includes(needle));
  rows = rows.slice(-800);
  return (
    <div className="stagewrap events">
      <div className="toolbar">
        <Seg sm label="Source" value={src} onChange={setSrc} items={[["wb", "Workbench"], ["compile", "Last compile"]]} />
        {src === "compile" ? <Seg sm label="Kinds" value={kind} onChange={setKind} items={[["all", "All"], ["passes", "Passes"], ["rewrites", "Rewrites"], ["declined", "Declined"], ["forks", "Forks"], ["errors", "Errors"]]} /> : null}
        <input className="evsearch" type="search" placeholder="Filter" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter events" />
        <span className="sp" />
        <Tog on={follow} onClick={() => setFollow(!follow)}>Follow</Tog>
      </div>
      <div className="scroll evlist" ref={box} onScroll={(e) => { const el = e.currentTarget; const atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 24; if (atEnd !== follow) setFollow(atEnd); }}>
        {rows.length ? rows.map((r, i) => (
          <div key={i} className={cls("ev", r.bad && "bad")} onClick={r.step != null ? () => { wb.select({ step: r.step }); wb.showView("trace"); } : undefined}>
            <span className="t">{r.t}</span><span className="kd">{r.kd}</span><span className="s">{r.s}</span>
          </div>
        )) : <Empty>Nothing yet.</Empty>}
      </div>
    </div>
  );
}
