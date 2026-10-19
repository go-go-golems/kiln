import React, { useMemo, useState } from "react";
import { wb } from "./wb.js";
import { useLab, Btn, Seg, Tog, Kv, Empty, cls } from "./common.jsx";
import { knobs as KN } from "@kiln/kiln/core/kiln.js";
import { canonRow } from "@kiln/kiln/std/tile.js";
import { Val, StatusStamp, Row, modelUs, modelVal, evidenceVal, optionEvidence } from "./marks.jsx";

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
  const src = wb.device.kind === "sim" ? "simulated" : "measured";
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
              <thead><tr><th>fork</th><th className="num">options</th><th>picked</th><th>by</th><th className="num" title="the cost model's estimate">model</th><th className="num" title={`the pooled decisive records on ${wb.evidenceId}`}>{src}</th></tr></thead>
              <tbody>
                {ds.map((x, i) => {
                  const kn = kernOf(x);
                  return (
                    <tr key={i} className={cls("clickable", i === di && "sel", x.failed && "badrow")} onClick={() => wb.select({ decision: i })}>
                      <td><b>{kn?.name || x.rule}</b> <span className="dim">{kn ? x.rule + " " : ""}@{x.node}</span></td>
                      <td className="num">{x.size}</td>
                      <td className="rowtxt">{x.failed ? "no legal option" : <Row row={rowOf(x.knobs)} />}{wb.kernelPins[x.key] ? " ⚑" : ""}</td>
                      <td className="bycol"><span className={cls("tag", x.by === "evidence" || x.by === "pinned" || x.by === "kernel-pin" ? "" : "dim")}>{x.by}</span>{x.note ? <span className="bynote">{x.note}</span> : null}</td>
                      <td className="num">{x.knobs ? <Val v={modelVal(x, x.knobs)} /> : "—"}</td>
                      <td className="num">{x.knobs ? <Val v={evidenceVal(wb.evidenceId, x.key, x.knobs, { src, name: wb.device.label })} /> : "—"}</td>
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
  const dev = wb.evidenceId, src = wb.device.kind === "sim" ? "simulated" : "measured";
  const opts = d.options.map((o, j) => ({ ...o, j, model: modelUs(d, o.knobs), ev: optionEvidence(dev, d.key, o.knobs) }));
  const evUs = (o) => o.ev?.stats?.median ?? Infinity;
  const sorted = [...opts].sort((a, b) => (sort === "model" ? (a.model ?? Infinity) - (b.model ?? Infinity) : sort === "measured" ? evUs(a) - evUs(b) : a.j - b.j));
  const chosen = KN.canonical(d.knobs || {});
  const pinned = wb.kernelPins[d.key];
  const bestModel = Math.min(...opts.map((o) => o.model ?? Infinity));
  const tryIt = async (o) => { wb.pinKernel(d.key, KN.canonical(o.knobs)); await wb.measure({ quiet: true }); };
  return (
    <div className="forkd">
      <div className="detail-h">
        <h2>{kern?.name || d.rule}</h2>
        <span className="sub">{d.rule} at {d.node} · {d.size} options · picked by <b>{d.by}</b>{d.note ? ` (${d.note})` : ""}{pinned ? " · pinned" : ""}</span>
        <span className="sp" />
        <Seg sm label="Sort" value={sort} onChange={setSort} items={[["model", "Model"], ["measured", src === "simulated" ? "Simulated" : "Measured"], ["order", "Order"]]} />
        {pinned ? <Btn sm onClick={() => wb.pinKernel(d.key, null)}>Unpin</Btn> : null}
      </div>
      {d.tried?.length ? <p className="note padded">Tried first and rejected: {d.tried.slice(0, 4).map((t) => `${rowOf(t.knobs)} (${t.reason})`).join("; ")}</p> : null}
      <div className="xscroll">
        <table className="rt opts">
          <thead><tr><th>option</th><th className="num" title="the cost model's estimate">model</th><th className="mcol" /><th className="num" title={`the pooled decisive records of each option on ${dev}: median, CI, n`}>{src}</th><th title={`the newest record of each option on ${dev}`}>validity</th><th /></tr></thead>
          <tbody>
            {sorted.slice(0, 80).map((o) => {
              const isChosen = KN.canonical(o.knobs) === chosen;
              const f = o.model != null && isFinite(o.model) ? bestModel / o.model : 0;
              return (
                <tr key={o.j} className={cls(isChosen && "sel", o.model === Infinity && "dimrow")}>
                  <td className="rowtxt">{isChosen ? "▸ " : ""}<Row row={rowOf(o.knobs)} />{o.original ? " (keep original)" : ""}</td>
                  <td className="num"><Val v={modelVal(d, o.knobs)} /></td>
                  <td className="mcol"><div className="meter"><i style={{ width: f * 100 + "%" }} /></div></td>
                  <td className="num">{o.ev ? <Val v={evidenceVal(dev, d.key, o.knobs, { src, name: wb.device.label })} /> : null}</td>
                  <td>{o.ev ? <StatusStamp rec={o.ev.rec} /> : null}</td>
                  <td><span className="rowacts">{!isChosen ? <button type="button" className="tabact" onClick={() => wb.pinKernel(d.key, KN.canonical(o.knobs))}>pin</button> : null}{wb.prog ? <button type="button" className="tabact" onClick={() => tryIt(o)} title="pin this option and measure the program">pin + measure</button> : null}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {sorted.length > 80 ? <p className="note padded">and {sorted.length - 80} more options</p> : null}
    </div>
  );
}
