import React, { useMemo, useRef, useState, useEffect } from "react";
import { wb } from "./wb.js";
import { useLab, Btn, Seg, Tog, Kv, Empty, cls } from "./common.jsx";
import { unifiedDiff, typeStr, identityOf } from "../core/kiln.js";
import { summarize, fmtUs } from "../core/util.js";
import { canonRow } from "../std/tile.js";

// ----------------------------------------------------------------------------- shared helpers
// The graph the IR and Graph views show: an IR checkpoint, or the graph right after a trace step.
const STEP_G = new WeakMap();
export function graphAtStep(run, i) {
  let m = STEP_G.get(run);
  if (!m) { m = new Map(); STEP_G.set(run, m); }
  if (!m.has(i)) { if (m.size > 8) m.clear(); m.set(i, run.stepGraph(i)); }
  return m.get(i);
}
export function viewGraph() {
  const run = wb.run;
  if (!run) return null;
  if (wb.sel.step != null && run.steps[wb.sel.step]) { const s = run.steps[wb.sel.step]; return { g: graphAtStep(run, wb.sel.step), step: s, label: `after step ${s.i}` }; }
  const ir = wb.sel.ir;
  if (ir === "@failure") return { g: run.graph, label: "where it stopped" };
  return { g: run.at(ir) || run.graph, label: ir };
}
const KERNEL_OPS = new Set(["loop.kernel", "tile.kernel", "kernel.kernel", "gpu.kernel"]);
const isKernel = (n) => KERNEL_OPS.has(n.name);
export const stepTouches = (s, id) => s.node === id || s.added?.includes(id) || s.changed?.includes(id) || s.removed?.includes(id);

export function selectNode(id) { wb.select({ node: id }); }
export function NodeRef({ id, g }) {
  const n = g?.nodes.get(id);
  const name = n?.def.name === "kiln.input" ? n.attrs.name : id;
  return <button type="button" className={cls("nid", wb.sel.node === id && "on")} onClick={() => selectNode(id)}>{name}</button>;
}

// IR text with clickable node ids
export function IrText({ text, g, hi }) {
  const lines = useMemo(() => String(text || "").split("\n"), [text]);
  const ids = g ? g.nodes : new Map();
  return (
    <pre className="irtext">
      {lines.map((ln, i) => {
        if (/^\s*#/.test(ln)) return <div key={i} className="cm">{ln || " "}</div>;
        if (/^(inputs|outputs):$/.test(ln)) return <div key={i} className="hd">{ln}</div>;
        const parts = [];
        let last = 0;
        ln.replace(/\b(n\d+)\b/g, (m, id, at) => {
          if (!ids.has(id)) return m;
          if (at > last) parts.push(ln.slice(last, at));
          parts.push(<button key={at} type="button" className={cls("nid", wb.sel.node === id && "on", hi?.has(id) && "hi")} onClick={() => selectNode(id)}>{id}</button>);
          last = at + m.length;
          return m;
        });
        if (last < ln.length) {
          const rest = ln.slice(last);
          const c = rest.indexOf("  # ");
          if (c >= 0) { parts.push(rest.slice(0, c)); parts.push(<span key="c" className="cm">{rest.slice(c)}</span>); }
          else parts.push(rest);
        }
        const def = /^n\d+ = /.test(ln.trimStart()) && !ln.startsWith(" ");
        return <div key={i} className={cls(def && "def", hi && def && hi.has(ln.split(" ")[0]) && "hl")}>{parts.length ? parts : " "}</div>;
      })}
    </pre>
  );
}

function PipeMap() {
  useLab("compile", "sel");
  const run = wb.run, pipe = wb.pipe;
  if (!run || !pipe) return null;
  const failedAt = !run.ok ? run.error?.ir || null : null;
  return (
    <div className="pipemap" role="list" aria-label="Pipeline">
      {pipe.steps.map((st, i) => {
        if (st.kind === "ir") {
          const have = run.checkpoints.has(st.name);
          return (
            <button key={i} type="button" role="listitem" className={cls("irchip", wb.sel.step == null && wb.sel.ir === st.name && "on", !have && "dim", failedAt === st.name && "bad")} disabled={!have} onClick={() => { wb.select({ ir: st.name, step: null }); }}
              title={have ? `${st.name}: ${run.at(st.name).size} nodes` : "not reached"}>
              <b>{st.name}</b><small>{have ? run.at(st.name).size : "—"}</small>
            </button>
          );
        }
        const s = run.passStats[st.pass.name];
        return (
          <button key={i} type="button" role="listitem" className={cls("passchip", !s && "dim")} title={`${st.pass.name}: ${s ? `${s.applied} rewrites, ${s.skipped} declined, ${s.forks} forks, ${s.ms.toFixed(1)} ms` : "did not run"}`}
            onClick={() => { wb.select({ tracePass: st.pass.name }); wb.showView("trace"); }}>
            <span className="arrow">→</span><b>{st.pass._short || st.pass.name}</b>{s ? <small>{s.applied}</small> : null}
          </button>
        );
      })}
      {!run.ok ? <button type="button" className={cls("irchip bad", wb.sel.ir === "@failure" && "on")} onClick={() => wb.select({ ir: "@failure", step: null })}><b>stopped</b><small>{run.graph.size}</small></button> : null}
    </div>
  );
}

function StepBanner({ v }) {
  if (!v?.step) return null;
  const s = v.step;
  return (
    <div className="stepbanner">
      <span>After step <b>{s.i}</b>: {s.pass}/{s.rule} at {s.node}</span>
      <span className="sp" />
      <Btn sm onClick={() => wb.select({ step: Math.max(0, s.i - 1) })} disabled={s.i === 0}>◂</Btn>
      <Btn sm onClick={() => wb.select({ step: Math.min(wb.run.steps.length - 1, s.i + 1) })} disabled={s.i >= wb.run.steps.length - 1}>▸</Btn>
      <Btn sm onClick={() => wb.select({ step: null })}>Back to the IRs</Btn>
    </div>
  );
}

// ----------------------------------------------------------------------------- IR view
export function IrView() {
  useLab("compile", "sel");
  const [bodies, setBodies] = useState(true);
  const [types, setTypes] = useState(true);
  const run = wb.run;
  if (!run) return <div className="stagewrap"><Empty>Compile a project to see its IRs.</Empty></div>;
  const v = viewGraph();
  const hi = v.step ? new Set([...(v.step.added || []), ...(v.step.changed || [])]) : null;
  const text = v.g.print({ body: bodies, types });
  return (
    <div className="page">
      <div className="stagewrap">
        <div className="toolbar">
          <PipeMap />
          <span className="sp" />
          <Tog on={bodies} onClick={() => setBodies(!bodies)} title="Show kernel bodies (loop nests, tile schedules, kernel IR, CUDA)">Bodies</Tog>
          <Tog on={types} onClick={() => setTypes(!types)}>Types</Tog>
        </div>
        <StepBanner v={v} />
        {!run.ok ? <div className="errbar"><b>{run.error.kind}</b> {run.error.message}</div> : null}
        <div className="scroll"><IrText text={text} g={v.g} hi={hi} /></div>
      </div>
      <NodeSide g={v.g} />
    </div>
  );
}

export function NodeSide({ g }) {
  useLab("sel", "compile", "measure");
  const id = wb.sel.node;
  const n = id && g?.nodes.get(id);
  const run = wb.run;
  if (!n) {
    const sum = g ? Object.entries(g.summary()).sort((a, b) => b[1] - a[1]) : [];
    return (
      <aside className="side">
        <div className="block"><header><h2>Ops at this level</h2></header>
          <Kv rows={sum.map(([op, c]) => [op, c])} />
          <p className="note">Click a node id to see its attributes, its uses, and the rewrites that made it.</p>
        </div>
      </aside>
    );
  }
  const attrs = Object.entries(n.attrs).filter(([key, x]) => !["K", "cuda", "wgsl", "expr", "body"].includes(key) && typeof x !== "function");
  const users = g.users(id);
  const hist = run ? run.steps.filter((s) => stepTouches(s, id)) : [];
  const decs = run ? run.decisions.filter((d) => d.node === id) : [];
  const kern = wb.prog?.kernels.find((x) => x.id === id);
  let ident = null;
  try { ident = identityOf(g, id); } catch {}
  return (
    <aside className="side">
      <div className="block">
        <header><h2>{n.def.name === "kiln.input" ? `input ${n.attrs.name}` : id}</h2><span className="sub">{n.name}</span></header>
        <Kv rows={[["type", typeStr(n.type)], ...attrs.map(([a, x]) => [a, summarize(x, 40)]), n.knobs ? ["knobs", canonRow(n.knobs)] : null, ident ? ["identity", String(ident).slice(0, 12)] : null, g.isOutput(id) ? ["output", g.outputs.filter((o) => o.id === id).map((o) => o.name).join(", ")] : null]} />
        {n.args.length ? <div className="refs"><span className="lbl">uses</span>{n.args.map((a, i) => <NodeRef key={i} id={a} g={g} />)}</div> : null}
        {users.length ? <div className="refs"><span className="lbl">used by</span>{users.map((u) => <NodeRef key={u} id={u} g={g} />)}</div> : null}
        {kern ? <Btn sm onClick={() => { wb.select({ kernel: kern.name }); wb.showView("kernels"); }}>Open {kern.name} in Kernels</Btn> : null}
      </div>
      {decs.length ? (
        <div className="block">
          <header><h2>Forks here</h2></header>
          {decs.map((d, i) => (
            <button key={i} type="button" className="linkrow" onClick={() => { wb.select({ decision: run.decisions.indexOf(d) }); wb.showView("knobs"); }}>
              <b>{d.rule}</b> picked {d.knobs ? canonRow(d.knobs) : "nothing"} of {d.size} <span className="dim">by {d.by}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="block">
        <header><h2>History</h2><span className="sub">{hist.length} step{hist.length === 1 ? "" : "s"}</span></header>
        {hist.length ? (
          <ol className="steplist">
            {hist.slice(-14).map((s) => (
              <li key={s.i}><button type="button" className={cls("linkrow", s.kind === "skip" && "dim")} onClick={() => { wb.select({ step: s.i }); wb.showView("trace"); }}>
                <span className="t">#{s.i}</span> <b>{s.short || ""}</b> {s.rule}{s.kind === "skip" ? " · declined" : s.removed?.includes(id) ? " · removed it" : s.added?.includes(id) ? " · made it" : " · changed it"}
              </button></li>
            ))}
          </ol>
        ) : <p className="note">An input or an untouched node.</p>}
      </div>
    </aside>
  );
}

// ----------------------------------------------------------------------------- Graph view
const NW = 158, NH = 42, CG = 54, RG = 14, PAD = 16;
function layout(g) {
  const order = g.topo();
  const depth = new Map();
  for (const id of order) { const n = g.nodes.get(id); depth.set(id, n.args.length ? 1 + Math.max(...n.args.map((a) => depth.get(a) ?? 0)) : 0); }
  // leaves (constants, weights) sit just left of their first user
  for (const id of order) {
    const n = g.nodes.get(id);
    if (n.args.length || n.def.name === "kiln.input") continue;
    const us = g.users(id);
    if (us.length) depth.set(id, Math.max(0, Math.min(...us.map((u) => depth.get(u))) - 1));
  }
  const cols = [];
  for (const id of order) { const d = depth.get(id); (cols[d] ||= []).push(id); }
  const pos = new Map();
  cols.forEach((col, ci) => {
    if (ci > 0) {
      const bary = (id) => { const a = g.nodes.get(id).args.map((x) => pos.get(x)?.y).filter((y) => y != null); return a.length ? a.reduce((s, y) => s + y, 0) / a.length : 1e9; };
      col.sort((a, b) => bary(a) - bary(b));
    }
    col.forEach((id, ri) => pos.set(id, { x: PAD + ci * (NW + CG), y: PAD + ri * (NH + RG) }));
  });
  const W = PAD * 2 + cols.length * (NW + CG) - CG, H = PAD * 2 + Math.max(1, ...cols.map((c) => c?.length || 0)) * (NH + RG) - RG;
  return { pos, W, H, order };
}
function nodeLabel(g, n) {
  if (n.def.name === "kiln.input") return [n.attrs.name, "input · " + typeStr(n.type)];
  if (isKernel(n)) return [n.attrs.name || n.def.short, [n.attrs.shape ? n.attrs.shape.join("×") : "", n.knobs ? canonRow(n.knobs) : ""].filter(Boolean).join(" · ")];
  const a = n.attrs;
  const extra = a.fn || a.op || a.name || (a.value != null && typeof a.value === "number" ? String(+a.value.toPrecision(4)) : "");
  return [`${n.def.short}${extra && extra !== n.def.short ? " " + extra : ""}`, typeStr(n.type)];
}
export function GraphView() {
  useLab("compile", "sel");
  const [zoom, setZoom] = useState(1);
  const run = wb.run;
  const v = run ? viewGraph() : null;
  const L = useMemo(() => (v ? layout(v.g) : null), [v?.g]);
  if (!run) return <div className="stagewrap"><Empty>Compile a project to see its graph.</Empty></div>;
  const g = v.g;
  const sel = wb.sel.node;
  const hi = v.step ? new Set([...(v.step.added || []), ...(v.step.changed || [])]) : null;
  const near = new Set(sel && g.nodes.has(sel) ? [sel, ...g.nodes.get(sel).args, ...g.users(sel)] : []);
  const big = L.order.length > 500;
  const shown = big ? L.order.slice(0, 500) : L.order;
  const vis = new Set(shown);
  return (
    <div className="page">
      <div className="stagewrap">
        <div className="toolbar">
          <PipeMap />
          <span className="sp" />
          <Seg sm label="Zoom" value={zoom} onChange={setZoom} items={[[0.5, "50%"], [0.75, "75%"], [1, "100%"], [0, "Fit"]]} />
        </div>
        <StepBanner v={v} />
        {big ? <div className="errbar">Showing 500 of {L.order.length} nodes.</div> : null}
        <div className="scroll graphscroll">
          <svg className="graph" width={zoom ? L.W * zoom : "100%"} height={zoom ? L.H * zoom : undefined} viewBox={`0 0 ${L.W} ${L.H}`} preserveAspectRatio="xMinYMin meet" role="img" aria-label={`Graph ${g.name}: ${g.size} nodes`}>
            <defs><marker id="ah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L8,4 L0,8 z" className="ahead" /></marker></defs>
            {shown.flatMap((id) => {
              const n = g.nodes.get(id), p = L.pos.get(id);
              return n.args.filter((a) => vis.has(a)).map((a, j) => {
                const q = L.pos.get(a);
                const x1 = q.x + NW, y1 = q.y + NH / 2, x2 = p.x, y2 = p.y + NH / 2, mx = (x1 + x2) / 2;
                const on = sel && (sel === id || sel === a);
                return <g key={id + ":" + j + a} className={cls("edge", on && "sel")}><path d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2 - 2},${y2}`} markerEnd="url(#ah)" /></g>;
              });
            })}
            {shown.map((id) => {
              const n = g.nodes.get(id), p = L.pos.get(id);
              const [lab, sub] = nodeLabel(g, n);
              const kind = n.def.name === "kiln.input" ? "device" : isKernel(n) ? "group" : !n.args.length ? "cell" : "";
              return (
                <g key={id} className={cls("node", kind, sel === id && "sel", hi?.has(id) && "busy", sel && !near.has(id) && "dim")} transform={`translate(${p.x},${p.y})`} onClick={() => selectNode(id)}>
                  <rect width={NW} height={NH} />
                  {g.isOutput(id) ? <path className="corner" d={`M${NW - 10},0 L${NW},0 L${NW},10`} /> : null}
                  <text className="nl" x="8" y="17">{clipText(lab, 22)}<tspan className="ns" dx="6">{id}</tspan></text>
                  <text className="ns" x="8" y="32">{clipText(sub, 30)}</text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
      <NodeSide g={g} />
    </div>
  );
}
const clipText = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + "…" : String(s));

// ----------------------------------------------------------------------------- Trace view
export function TraceView() {
  useLab("compile", "sel");
  const [skips, setSkips] = useState(false);
  const [q, setQ] = useState("");
  const run = wb.run;
  const listRef = useRef(null);
  useEffect(() => { const el = listRef.current?.querySelector(".trow.on"); el?.scrollIntoView?.({ block: "nearest" }); }, [wb.sel.step]);
  if (!run) return <div className="stagewrap"><Empty>Compile a project to trace its passes.</Empty></div>;
  const passes = wb.pipe.passes;
  const tp = wb.sel.tracePass || "all";
  const needle = q.trim().toLowerCase();
  const rows = run.steps.filter((s) => (skips || s.kind === "rewrite") && (tp === "all" || s.pass === tp) && (!needle || `${s.pass} ${s.rule} ${s.node} ${s.reason || ""}`.toLowerCase().includes(needle)));
  const s = wb.sel.step != null ? run.steps[wb.sel.step] : null;
  return (
    <div className="page">
      <div className="stagewrap">
        <div className="toolbar">
          <Seg sm label="Pass" value={tp} onChange={(x) => wb.select({ tracePass: x })} items={[["all", "All"], ...passes.map((p) => [p.name, p._short || p.name, p.name])]} />
          <Tog on={skips} onClick={() => setSkips(!skips)} title="Show the matches a rule declined (skip) and why">Declined</Tog>
          <input className="evsearch" type="search" placeholder="Filter rules, nodes" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter steps" />
          <span className="sp" />
          <span className="lbl">{rows.length} of {run.steps.length} steps · {run.ms.toFixed(0)} ms</span>
        </div>
        <div className="scroll" ref={listRef}>
          {rows.length ? rows.map((x) => (
            <div key={x.i} className={cls("trow", x.kind === "skip" && "skip", s === x && "on")}>
              <button type="button" className="trow-h" onClick={() => wb.select({ step: s === x ? null : x.i })} aria-expanded={s === x}>
                <span className="t">#{x.i}</span><span className="ps">{x.short || ""}</span><b>{x.rule}</b><span className="at">@{x.node || "graph"}</span>
                {x.decision ? <span className="tag">fork {x.decision.size} · {canonRow(x.decision.knobs || {})} · {x.decision.by}</span> : null}
                {x.kind === "skip" ? <span className="why">{x.reason}</span> : <span className="delta">{x.added?.length ? `+${x.added.length}` : ""} {x.removed?.length ? `−${x.removed.length}` : ""} {x.changed?.length ? `~${x.changed.length}` : ""}</span>}
              </button>
              {s === x && x.kind === "rewrite" ? <Diff before={x.before} after={x.after} /> : null}
            </div>
          )) : <Empty>No steps match.</Empty>}
        </div>
      </div>
      <aside className="side">
        {s ? (
          <div className="block">
            <header><h2>Step {s.i}</h2><span className="sub">{s.kind === "skip" ? "declined" : "rewrite"}</span></header>
            <Kv rows={[["pass", s.pass], ["rule", s.rule], ["at", s.node || "whole graph"], ["time", s.t.toFixed(1) + " ms"], s.decision ? ["fork", `${s.decision.size} options, by ${s.decision.by}`] : null, s.decision ? ["picked", canonRow(s.decision.knobs || {})] : null]} />
            {s.kind === "skip" ? <p className="srow-msg">{s.reason}</p> : null}
            <div className="actions">
              <Btn sm onClick={() => wb.showView("ir")}>Graph text here</Btn>
              <Btn sm onClick={() => wb.showView("graph")}>Graph here</Btn>
              <Btn sm onClick={() => wb.select({ step: null })}>Clear</Btn>
            </div>
          </div>
        ) : <div className="block"><p className="note">Pick a step to see its diff, then look at the whole graph at that moment in the IR or Graph view.</p></div>}
        <div className="block">
          <header><h2>Passes</h2></header>
          <table className="rt">
            <thead><tr><th>pass</th><th className="num">rewrites</th><th className="num">declined</th><th className="num">forks</th><th>ms</th></tr></thead>
            <tbody>
              {passes.map((p) => { const st = run.passStats[p.name]; return (
                <tr key={p.name} className={cls("clickable", tp === p.name && "sel")} onClick={() => wb.select({ tracePass: tp === p.name ? "all" : p.name })}>
                  <td><b>{p._short}</b> {p.name.split("/").pop()}</td><td className="num">{st?.applied ?? "—"}</td><td className="num">{st?.skipped ?? "—"}</td><td className="num">{st?.forks ?? "—"}</td><td>{st ? st.ms.toFixed(1) : "—"}</td>
                </tr>); })}
            </tbody>
          </table>
        </div>
        {run.warnings.length ? <div className="block"><header><h2>Warnings</h2></header>{run.warnings.map((w, i) => <p key={i} className="note">{w}</p>)}</div> : null}
      </aside>
    </div>
  );
}
export function Diff({ before, after }) {
  const d = useMemo(() => unifiedDiff(before, after), [before, after]);
  return <div className="diff">{d.map((l, i) => <div key={i} className={l.op === "+" ? "add" : l.op === "-" ? "del" : ""}><i>{l.op}</i>{l.text}</div>)}</div>;
}
