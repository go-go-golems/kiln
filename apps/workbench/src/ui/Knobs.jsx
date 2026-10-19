import React, { useMemo, useState } from "react";
import { wb } from "./wb.js";
import { useLab, Btn, Seg, Tog, Kv, Empty, cls } from "./common.jsx";
import { knobs as KN } from "@kiln/kiln/core/kiln.js";
import { fmtUs } from "@kiln/kiln/core/util.js";
import { canonRow, analyze, estimate } from "@kiln/kiln/std/tile.js";

// one parameter: a slider, a choice, a switch or a text box, depending on its type
export function ParamControl({ p, knob = false }) {
  useLab("params", "compile");
  const pinned = wb.params.isPinned(p.name);
  const v = wb.params.get(p.name);
  const set = (x) => wb.setParam(p, x);
  const o = p.opts || {};
  let ctl;
  if (knob) {
    const vals = p.values();
    ctl = (
      <select value={pinned ? String(v) : "@auto"} onChange={(e) => (e.target.value === "@auto" ? wb.unpin(p.name) : wb.pin({ [p.name]: e.target.value }))} aria-label={p.name}>
        <option value="@auto">auto</option>
        {vals.map((x) => <option key={String(x)} value={String(x)}>{String(x)}</option>)}
      </select>
    );
  } else if ((p.type === "int" || p.type === "float") && o.min != null && o.max != null) {
    const log = o.scale === "log";
    const toS = (x) => (log ? Math.log2(x) : x), fromS = (s) => (log ? Math.round(2 ** s) : s);
    ctl = <input type="range" min={toS(o.min)} max={toS(o.max)} step={log ? 1 : o.step || (p.type === "int" ? 1 : (o.max - o.min) / 100)} value={toS(v)} onChange={(e) => set(fromS(+e.target.value))} aria-label={p.name} />;
  } else if (p.type === "enum") {
    ctl = o.values.length <= 5 ? <Seg sm label={p.name} value={v} onChange={set} items={o.values.map((x) => [x, String(x)])} /> : <select value={String(v)} onChange={(e) => set(e.target.value)} aria-label={p.name}>{o.values.map((x) => <option key={String(x)} value={String(x)}>{String(x)}</option>)}</select>;
  } else if (p.type === "bool") {
    ctl = <Tog on={!!v} onClick={() => set(!v)}>{v ? "on" : "off"}</Tog>;
  } else {
    ctl = <input type="text" className="filter" defaultValue={v ?? ""} onBlur={(e) => e.target.value !== String(v ?? "") && set(e.target.value)} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} aria-label={p.name} />;
  }
  return (
    <div className="prow" title={p._help || ""}>
      <span className="pn">{p.name}{p._phase === "run" ? <i> run</i> : null}</span>
      <span className="pc">{ctl}</span>
      <span className="pv">{knob ? (pinned ? "pinned" : "") : typeof v === "number" ? +v.toPrecision(5) : String(v)}</span>
      {pinned && !knob && o.default !== undefined && v !== o.default ? <button type="button" className="tabact" title="Back to the default" onClick={() => wb.unpin(p.name)}>↺</button> : <span />}
    </div>
  );
}

// the parameters a project exposes: its own sliders, its pipeline's parameters, the knobs of its own passes
// (forks you can pin), and the standard schedule knobs
const STD_KNOBS = new Set(["MAP", "TPB", "COARSEN", "STAGE", "BM", "BN", "BK", "TM", "TN"]);
export function paramGroups() {
  const pipe = wb.pipe;
  if (!pipe) return { program: wb.project?._params || [], pipeline: [], knobs: [], schedule: [] };
  const program = wb.project?._params || [];
  const knobList = [];
  for (const ps of pipe.passes) for (const kn of ps._knobs) if (!knobList.some((x) => x.name === kn.name)) knobList.push(kn);
  const knobNames = new Set(knobList.map((x) => x.name));
  const pipeline = pipe.allParams().filter((p) => !knobNames.has(p.name) && !program.some((x) => x.name === p.name));
  return { program, pipeline, knobs: knobList.filter((x) => !STD_KNOBS.has(x.name)), schedule: knobList.filter((x) => STD_KNOBS.has(x.name)) };
}

const modelCache = new WeakMap();
function modelUs(d, knobs) {
  const g = wb.run?.at("loop");
  const n = g?.nodes.get(d.node);
  if (!n || n.name !== "loop.kernel") return null;
  let m = modelCache.get(n);
  if (!m) { m = new Map(); modelCache.set(n, m); }
  const key = KN.canonical(knobs) + "|" + wb.device.id;
  if (!m.has(key)) {
    try { const an = analyze(n.attrs.expr, n.attrs.shape, n.args.map((a) => g.nodes.get(a).type.shape)); m.set(key, estimate(an, knobs, wb.device.target).us); } catch { m.set(key, null); }
  }
  return m.get(key);
}
const measuredFor = (d) => { const m = new Map(); for (const r of wb.store.list({ device: wb.device.id, identity: d.key })) m.set(KN.canonical(r.knobs), r); return m; };
const rowOf = (knobs) => (knobs && "MAP" in knobs ? canonRow(knobs) : KN.canonical(knobs || {}) || "(original)");

export function KnobsView() {
  useLab("compile", "sel", "store", "params", "measure", "device");
  const [sort, setSort] = useState("model");
  const run = wb.run;
  if (!run) return <div className="stagewrap"><Empty>Compile a project to see its forks.</Empty></div>;
  const ds = run.decisions;
  const di = wb.sel.decision != null && ds[wb.sel.decision] ? wb.sel.decision : ds.length ? 0 : null;
  const d = di != null ? ds[di] : null;
  const kernOf = (dd) => wb.prog?.kernels.find((x) => x.identity === dd.key);
  const G = paramGroups();
  const progParams = G.program, pipeParams = G.pipeline, knobParams = G.schedule, ownKnobs = G.knobs;
  const kp = Object.entries(wb.kernelPins);
  return (
    <div className="page">
      <div className="stagewrap">
        <div className="toolbar">
          <span className="lbl">{ds.length} fork{ds.length === 1 ? "" : "s"} · decided by pins, then evidence on {wb.device.label}, then the cost model</span>
          <span className="sp" />
          {kp.length ? <Btn sm onClick={() => { wb.kernelPins = {}; wb.compile(); }}>Clear {kp.length} kernel pin{kp.length > 1 ? "s" : ""}</Btn> : null}
        </div>
        <div className="scroll">
          {ds.length ? (
            <table className="rt knobt">
              <thead><tr><th>fork</th><th className="num">options</th><th>picked</th><th>by</th><th className="num">model</th><th className="num">measured</th></tr></thead>
              <tbody>
                {ds.map((x, i) => {
                  const kn = kernOf(x), meas = measuredFor(x), mine = meas.get(KN.canonical(x.knobs || {}));
                  return (
                    <tr key={i} className={cls("clickable", i === di && "sel", x.failed && "badrow")} onClick={() => wb.select({ decision: i })}>
                      <td><b>{kn?.name || x.rule}</b> <span className="dim">{kn ? x.rule + " " : ""}@{x.node}</span></td>
                      <td className="num">{x.size}</td>
                      <td>{x.failed ? "no legal option" : rowOf(x.knobs)}{wb.kernelPins[x.key] ? " ⚑" : ""}</td>
                      <td><span className={cls("tag", x.by === "evidence" || x.by === "pinned" ? "" : "dim")}>{x.by}</span></td>
                      <td className="num">{x.knobs ? fmtUs(modelUs(x, x.knobs)) : "—"}</td>
                      <td className="num">{mine ? fmtUs(mine.us) : meas.size ? `${meas.size} rows` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : <Empty>No forks: every rule in this pipeline rewrote one way. Forks come from rules that return k.fork(…) or an array of options.</Empty>}
          {d ? <ForkDetail d={d} sort={sort} setSort={setSort} kern={kernOf(d)} /> : null}
        </div>
      </div>
      <aside className="side">
        {progParams.length ? <div className="block"><header><h2>Program</h2><span className="sub">re-traces the program</span></header>{progParams.map((p) => <ParamControl key={p.name} p={p} />)}</div> : null}
        {pipeParams.length ? <div className="block"><header><h2>Pipeline</h2></header>{pipeParams.map((p) => <ParamControl key={p.name} p={p} />)}</div> : null}
        {ownKnobs.length ? (
          <div className="block">
            <header><h2>This project's knobs</h2></header>
            {ownKnobs.map((p) => <ParamControl key={p.name} p={p} knob />)}
            <p className="note">Forks offered by the project's own passes. "auto" lets the decide policy choose at each node; a value pins it everywhere.</p>
          </div>
        ) : null}
        {knobParams.length ? (
          <div className="block">
            <header><h2>Schedule knobs for every kernel</h2></header>
            {knobParams.map((p) => <ParamControl key={p.name} p={p} knob />)}
            <p className="note">Pinning a knob here narrows every fork that offers it. To fix one kernel, pin its row in the fork detail.</p>
          </div>
        ) : null}
        {kp.length ? (
          <div className="block">
            <header><h2>Kernel pins</h2></header>
            {kp.map(([id, row]) => (
              <div key={id} className="prow"><span className="pn">{wb.prog?.kernels.find((x) => x.identity === id)?.name || id.slice(0, 8)}</span><span className="pc">{row}</span><span /><button type="button" className="tabact" onClick={() => wb.pinKernel(id, null)} title="Unpin">✕</button></div>
            ))}
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function ForkDetail({ d, sort, setSort, kern }) {
  const meas = measuredFor(d);
  const opts = d.options.map((o, j) => ({ ...o, j, model: modelUs(d, o.knobs), meas: meas.get(KN.canonical(o.knobs)) }));
  const sorted = [...opts].sort((a, b) => (sort === "model" ? (a.model ?? Infinity) - (b.model ?? Infinity) : sort === "measured" ? (a.meas?.us ?? Infinity) - (b.meas?.us ?? Infinity) : a.j - b.j));
  const chosen = KN.canonical(d.knobs || {});
  const pinned = wb.kernelPins[d.key];
  const bestModel = Math.min(...opts.map((o) => o.model ?? Infinity));
  const tryIt = async (o) => { wb.pinKernel(d.key, KN.canonical(o.knobs)); await wb.measure({ quiet: true }); };
  return (
    <div className="forkd">
      <div className="detail-h">
        <h2>{kern?.name || d.rule}</h2>
        <span className="sub">{d.rule} at {d.node} · {d.size} options · picked by {d.by}{pinned ? " · pinned" : ""}</span>
        <span className="sp" />
        <Seg sm label="Sort" value={sort} onChange={setSort} items={[["model", "Model"], ["measured", "Measured"], ["order", "Order"]]} />
        {pinned ? <Btn sm onClick={() => wb.pinKernel(d.key, null)}>Unpin</Btn> : null}
      </div>
      {d.tried?.length ? <p className="note padded">Tried first and rejected: {d.tried.slice(0, 4).map((t) => `${rowOf(t.knobs)} (${t.reason})`).join("; ")}</p> : null}
      <table className="rt opts">
        <thead><tr><th>option</th><th className="num">model</th><th className="mcol" /><th className="num">{wb.device.kind === "sim" ? "simulated" : "measured"}</th><th>check</th><th /></tr></thead>
        <tbody>
          {sorted.slice(0, 80).map((o) => {
            const isChosen = KN.canonical(o.knobs) === chosen;
            const f = o.model != null && isFinite(o.model) ? bestModel / o.model : 0;
            return (
              <tr key={o.j} className={cls(isChosen && "sel", o.model === Infinity && "dimrow")}>
                <td>{isChosen ? "▸ " : ""}{rowOf(o.knobs)}{o.original ? " (keep original)" : ""}</td>
                <td className="num">{o.model == null ? "—" : isFinite(o.model) ? fmtUs(o.model) : "infeasible"}</td>
                <td className="mcol"><div className="meter"><i style={{ width: f * 100 + "%" }} /></div></td>
                <td className="num">{o.meas ? fmtUs(o.meas.us) : ""}</td>
                <td>{o.meas ? (o.meas.ok === false ? <span className="bad">✕</span> : "✓") : ""}</td>
                <td><span className="rowacts">{!isChosen ? <button type="button" className="tabact" onClick={() => wb.pinKernel(d.key, KN.canonical(o.knobs))}>pin</button> : null}{wb.prog ? <button type="button" className="tabact" onClick={() => tryIt(o)}>pin + measure</button> : null}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {sorted.length > 80 ? <p className="note padded">and {sorted.length - 80} more options</p> : null}
    </div>
  );
}
