import React, { useRef, useState } from "react";
import { wb, RUNNER } from "./wb.js";
import { useLab, Btn, Seg, Tog, Kv, Meter, Spark, Empty, cls } from "./common.jsx";
import { fmtUs, fmtBytes, fmtNum } from "@kiln/kiln/core/util.js";
import { knobs as KN } from "@kiln/kiln/core/kiln.js";
import { saveText, copyText } from "./Kernels.jsx";
import { CODEGEN_VERSION } from "@kiln/kiln/std/records.js";
import { METHOD, Val, StatusStamp, modelOf, modelVal, evidenceVal, missingVal, optionEvidence, decisionOf, simRef, hwRef, shortId } from "./marks.jsx";

const pct = (x) => (x == null ? "—" : (x * 100).toFixed(0) + "%");
const num = (x, d = 1) => (x == null || !isFinite(x) ? "—" : x >= 100 ? x.toFixed(0) : x.toFixed(d));

function DevicePicker() {
  useLab("device");
  return (
    <select value={wb.deviceId} onChange={(e) => wb.setDevice(e.target.value)} aria-label="Device">
      <optgroup label="Simulated">{wb.devices.filter((d) => d.kind === "sim").map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</optgroup>
      <optgroup label="Real">{wb.devices.filter((d) => d.kind !== "sim").map((d) => <option key={d.id} value={d.id}>{d.label}{d.status === "ready" ? "" : " (" + d.status.split(":")[0] + ")"}</option>)}</optgroup>
    </select>
  );
}

// ----------------------------------------------------------------------------- Perf
// Each kernel's three numbers side by side (guide §24): the model's estimate, the simulator's, and the hardware
// median with its interval, each with its provenance mark; the validity of this device's record; the roofline
// with a mark per source; a title block naming where the numbers came from.
const knobsOf = (x) => wb.store.records.get(x.record)?.kernel.knobs ?? wb.prog?.kernels.find((k) => k.identity === x.identity && k.row === x.row)?.map ?? KN.parse(x.row);

export function PerfView() {
  useLab("measure", "compile", "device", "sel", "store");
  const [all, setAll] = useState(false);
  const m = wb.measures[wb.deviceId];
  const s = wb.summary();
  const rows = m ? m.kernels : (wb.prog?.kernels || []).map((kn) => ({ name: kn.name, identity: kn.identity, row: kn.row, us: null, metrics: null, record: null }));
  const sim = simRef(), hw = hwRef(new Set(rows.map((x) => x.identity)));
  const cells = rows.map((x) => {
    const knobs = knobsOf(x), d = decisionOf(x.identity);
    return {
      x, knobs, d, rec: wb.store.records.get(x.record) || null, model: modelVal(d, knobs),
      sim: sim ? evidenceVal(sim.evidenceId, x.identity, knobs, { src: "simulated", name: sim.name }) : missingVal("no simulator"),
      hw: hw ? evidenceVal(hw.id, x.identity, knobs, { src: "measured", name: hw.name }) : missingVal(wb.device.kind === "sim" ? "no measurement on real hardware: pick WebGPU or CUDA in Devices and Measure" : `${wb.device.label} is not probed`),
    };
  });
  const sel = cells.find((c) => c.x.name === wb.sel.kernel) || cells[0];
  const hist = wb.history.filter((h) => h.device === wb.deviceId && h.preset === wb.preset?.id && isFinite(h.total));
  const measureAll = async () => {
    setAll(true);
    for (const d of wb.devices.filter((x) => x.kind === "sim")) await wb.measure({ device: d, quiet: true });
    setAll(false);
    wb.toast("Measured on every simulated GPU");
  };
  const others = Object.values(wb.measures).filter((r) => r.preset === wb.preset?.id);
  const xtra = "xtra num";
  return (
    <div className="page">
      <div className="stagewrap">
        <div className="toolbar">
          <DevicePicker />
          <Btn primary onClick={() => wb.measure()} disabled={!wb.prog || !!wb.measuring}>{wb.measuring ? `Measuring ${wb.measuring.done}/${wb.measuring.total}…` : "Measure"}</Btn>
          <Btn onClick={measureAll} disabled={!wb.prog || !!wb.measuring || all}>Every simulated GPU</Btn>
          <span className="sp" />
          {m ? <span className="lbl">{m.imported ? "imported" : new Date(m.t).toLocaleTimeString()}{s.stale ? " · the program changed since" : ""}</span> : null}
        </div>
        <div className="scroll">
          {!wb.prog ? <Empty>{wb.run?.ok ? "This pipeline does not end in GPU kernels." : "Compile the project first."}</Empty> : (
            <>
              <div className="perfhead">
                <BigNumber m={m} cells={cells} />
                {hist.length > 1 ? <div className="histspark"><Spark values={hist.map((h) => h.total)} h={36} /><span className="lbl">last {hist.length} measurements</span></div> : null}
              </div>
              {!m ? <p className="note padded">Measure to run every kernel on {wb.device.label}: time, metrics, and a check of sampled outputs against the reference. Until then the numbers are the cost model's.</p> : null}
              <div className="xscroll">
                <table className="rt perft">
                  <thead><tr>
                    <th>kernel</th>
                    <th className="num" title={`model: ${METHOD.model}`}>model</th>
                    <th className="num" title={sim ? `simulated on ${sim.name}: ${METHOD.sim()}` : "no simulator"}>simulated</th>
                    <th className="num" title={hw ? `measured on ${hw.name}: ${METHOD.stats("N")}` : "no real device measured"}>measured</th>
                    <th title={`the status of this device's record: invalid, stale, partial or valid`}>validity</th>
                    <th className="mcol">share</th><th>bound</th><th className="num">occ.</th><th className="num">GB/s</th><th className="num">GFLOP/s</th>
                    <th className={xtra} title="global-load sectors per warp request (4 is perfectly coalesced fp32)">sect/req</th><th className={xtra} title="extra shared-memory wavefronts per request">bank</th><th className={xtra} title="branch instructions where a warp diverged">div.</th>
                  </tr></thead>
                  <tbody>
                    {cells.map((c) => {
                      const x = c.x, mt = x.metrics || {}, bad = x.error || x.check?.ok === false || (c.rec && wb.store.status(c.rec) === "invalid");
                      return (
                        <tr key={x.name} className={cls("clickable", sel === c && "sel", bad && "badrow")} onClick={() => wb.select({ kernel: x.name, record: x.record || wb.sel.record })}>
                          <td className="nm">{x.name}</td>
                          <td className="num"><Val v={c.model} /></td><td className="num"><Val v={c.sim} /></td><td className="num"><Val v={c.hw} /></td>
                          <td>{x.error ? <span className="stamp bad" title={x.error}>error</span> : <StatusStamp rec={c.rec} />}</td>
                          <td className="mcol">{m ? <Meter f={isFinite(x.us) ? x.us / m.total : 0} /> : null}</td>
                          <td>{mt.bound || "—"}</td><td className="num">{pct(mt.occupancy)}</td><td className="num">{num(mt.gbs, 0)}</td><td className="num">{num(mt.gflops, 0)}</td>
                          <td className={cls(xtra, mt.ldSectorsPerReq > 8 && "bad")}>{num(mt.ldSectorsPerReq)}</td><td className={cls(xtra, mt.bankConflicts > 0.5 && "bad")}>{num(mt.bankConflicts, 2)}</td><td className={xtra}>{mt.divergence != null ? pct(mt.divergence) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Roofline cells={cells} sel={sel} sim={sim} hw={hw} />
              {others.length > 1 ? (
                <div className="block">
                  <header><h2>Across devices</h2><span className="sub">this project's last measurement on each</span></header>
                  <table className="rt">
                    <thead><tr><th>device</th><th className="num">total</th><th>slowest kernel</th><th /></tr></thead>
                    <tbody>{others.sort((a, b) => a.total - b.total).map((r) => {
                      const slow = r.kernels.reduce((a, b) => (b.us > a.us ? b : a)), simd = r.device.startsWith("sim:");
                      return <tr key={r.device} className={cls(r.device === wb.deviceId && "sel")}><td>{r.deviceName}</td><td className="num"><span className="val" title={simd ? `simulated: sum of the kernels' ${METHOD.sim()}` : "measured: sum of the kernels' medians"}><i className={cls("prov", simd ? "heuristic" : "derived")} />{fmtUs(r.total)}</span></td><td>{slow.name} · {fmtUs(slow.us)}</td><td><Meter f={Math.min(...others.map((o) => o.total)) / r.total} /></td></tr>;
                    })}</tbody>
                  </table>
                </div>
              ) : null}
              <div className="titleblock">
                <div><label>project</label><b>{wb.preset ? `${wb.preset.id} ${wb.preset.title}` : "—"}</b></div>
                <div><label>device</label><b>{m?.deviceName ?? wb.device.label}</b></div>
                <div><label>evidence id</label><b>{m?.evidenceId ?? wb.evidenceId}</b></div>
                <div><label>data</label><b>{!m ? "model only" : m.imported ? "imported" : m.device.startsWith("sim:") ? "simulated" : "measured"}</b></div>
                <div><label>code generator</label><b>{CODEGEN_VERSION}</b></div>
                <div><label>records</label><b>{cells.filter((c) => c.rec).length} shown · {wb.store.size} stored</b></div>
                {m ? <div><label>measured at</label><b>{new Date(m.t).toLocaleTimeString()}</b></div> : null}
              </div>
            </>
          )}
        </div>
      </div>
      <aside className="side">
        {m && sel ? <KernelMetrics x={sel.x} rec={sel.rec} /> : <div className="block"><p className="note">Simulated devices report Nsight-style metrics from a lockstep SIMT simulation of sampled blocks; WebGPU and CUDA report real time, and CUDA adds Nsight Compute metrics when the runner has ncu.</p></div>}
      </aside>
    </div>
  );
}

// the total with its provenance mark and source word: simulated, measured on <device>, or model only
function BigNumber({ m, cells }) {
  let total, prov, word, title, hw = false;
  if (m) {
    const simd = m.device.startsWith("sim:"), failed = !isFinite(m.total);
    hw = !simd && !failed; // a dashed stamp says "not hardware evidence" (§32.4); a hardware total is solid
    total = m.total;
    prov = failed ? "bad" : simd ? "heuristic" : "derived";
    word = simd ? "simulated" : `measured on ${m.deviceName}`;
    title = failed ? "a kernel failed its check or did not run, so there is no total" : simd ? `simulated: the sum of the kernels' times, each a ${METHOD.sim()}` : "measured: the sum of the kernels' medians over the protocol's repetitions";
  } else {
    total = cells.reduce((a, c) => a + (modelOf(c.d, c.knobs)?.us ?? NaN), 0);
    prov = "heuristic"; word = "model only"; title = `model: the sum of the kernels' estimates, each an ${METHOD.model}`;
  }
  return (
    <div className="bignum">
      <b title={title}><i className={cls("prov", prov)} />{fmtUs(total)}</b>
      <span><span className={cls("stamp", hw && "solid")}>{word}</span> {cells.length} kernel{cells.length === 1 ? "" : "s"}{m ? "" : ` on ${wb.device.label}`}</span>
    </div>
  );
}

function KernelMetrics({ x, rec }) {
  const mt = x.metrics || {};
  const parts = mt.parts ? Object.entries(mt.parts).filter(([, v]) => isFinite(v)) : [];
  const pmax = Math.max(1e-9, ...parts.map(([, v]) => v));
  const counted = mt.sampledBlocks ? METHOD.counts(mt.sampledBlocks, (mt.blocks || mt.sampledBlocks) / mt.sampledBlocks) : null;
  return (
    <>
      <div className="block">
        <header><h2>{x.name}</h2><span className="sub">{x.row}</span></header>
        {x.error ? <p className="srow-msg">{x.error}</p> : null}
        {x.check ? <p className={x.check.ok ? "note" : "srow-msg"}>{x.check.ok ? `✓ ${x.check.n || ""} sampled outputs match the reference` : "✕ " + x.check.message}</p> : null}
        {counted ? <p className="note"><span className="val" title={`derived: ${counted}`}><i className="prov derived" />counts</span> from a {counted}</p> : null}
        <Kv rows={[
          ["time", fmtUs(x.us)], mt.min != null ? ["fastest run", fmtUs(mt.min)] : null, ["timing", mt.kind || "—"],
          mt.bound ? ["bound by", mt.bound] : null, mt.occupancy != null ? ["occupancy", `${pct(mt.occupancy)} (${mt.blocksPerSM} blocks/SM, ${mt.limiter})`] : null,
          mt.waves != null ? ["waves", `${mt.waves} at ${pct(mt.util)} SM use`] : null,
          ["threads × blocks", `${mt.threads ?? "?"} × ${mt.blocks ?? "?"}`], mt.smem ? ["shared memory", fmtBytes(mt.smem)] : null, mt.regs != null ? ["registers", mt.regs] : null,
          mt.dram != null ? ["DRAM bytes", fmtBytes(mt.dram)] : null, mt.traffic != null ? ["L2 traffic", fmtBytes(mt.traffic)] : null, mt.flops != null ? ["flops", fmtNum(mt.flops)] : null,
          mt.intensity != null ? ["intensity", num(mt.intensity, 2) + " flop/B"] : null, mt.gbs != null ? ["achieved", `${num(mt.gbs, 0)} GB/s`] : null,
          mt.ldSectorsPerReq ? ["load sectors/request", num(mt.ldSectorsPerReq, 2) + (mt.ldSectorsPerReq > 4.5 ? " (uncoalesced)" : "")] : null,
          mt.stSectorsPerReq ? ["store sectors/request", num(mt.stSectorsPerReq, 2)] : null,
          mt.smemWavesPerReq ? ["smem wavefronts/request", num(mt.smemWavesPerReq, 2)] : null, mt.syncs ? ["barriers", fmtNum(mt.syncs)] : null,
          mt.sampledBlocks ? ["sampled blocks", mt.sampledBlocks] : null,
          ...Object.entries(mt).filter(([key]) => key.startsWith("ncu_") || key.includes("__")).map(([key, v]) => [key.replace(/^ncu_/, ""), String(v)]),
        ]} />
      </div>
      {rec ? (
        <div className="block">
          <header><h2>Record</h2><span className="sub">{rec.device.name}</span></header>
          <p className="recline"><StatusStamp rec={rec} /> <span className="mono dim" title={rec.id}>{shortId(rec.id)}</span></p>
          <div className="actions"><Btn sm onClick={() => { wb.select({ record: rec.id }); wb.showView("evidence"); }}>Open in Evidence</Btn></div>
        </div>
      ) : null}
      {parts.length ? (
        <div className="block">
          <header><h2>Where the time goes</h2><span className="sub"><span className="val" title={`model: ${METHOD.model}`}><i className="prov heuristic" />model lower bounds</span></span></header>
          {parts.map(([key, v]) => <div key={key} className="partrow"><span>{key}</span><Meter f={v / pmax} bad={key === mt.bound} /><span className="num">{fmtUs(v)}</span></div>)}
          <p className="note">The longest bar bounds the kernel; launch overhead and partial waves add to it.</p>
        </div>
      ) : null}
    </>
  );
}

// Up to three marks per kernel: the model (hollow) at the model's own counts, the simulator (half filled) at its
// counts, the hardware median (filled, with its interval as a whisker) at the simulator's intensity, or the model's
// when nothing was simulated. One label per kernel, placed so labels do not overlap. The selected kernel's label
// and its top mark (the most measured one) are red; its other marks keep their fill and get a red ring.
function Roofline({ cells, sel, sim, hw }) {
  const t = wb.device.target;
  const peak = t.peakTflops * 1e3, bw = t.bwGBs;
  const ks = cells.map((c) => {
    const e = modelOf(c.d, c.knobs);
    const model = e && isFinite(e.us) && e.flops > 0 && e.dram > 0 ? { I: e.flops / e.dram, P: e.flops / e.us / 1e3 } : null;
    const se = sim && optionEvidence(sim.evidenceId, c.x.identity, c.knobs), sc = se?.rec.counts;
    const simPt = se?.stats && sc?.flops > 0 && sc?.dram > 0 ? { I: sc.flops / sc.dram, P: sc.flops / se.stats.median / 1e3 } : null;
    const he = hw && optionEvidence(hw.id, c.x.identity, c.knobs), flops = sc?.flops > 0 && sc?.dram > 0 ? sc : e && e.flops > 0 && e.dram > 0 ? e : null;
    const hwPt = he?.stats && flops ? { I: flops.flops / flops.dram, P: flops.flops / he.stats.median / 1e3, Plo: flops.flops / he.stats.hi / 1e3, Phi: flops.flops / he.stats.lo / 1e3 } : null;
    return { c, model, sim: simPt, hw: hwPt, top: hwPt ? "hw" : simPt ? "sim" : "model" };
  }).filter((k) => k.model || k.sim || k.hw);
  if (!ks.length) return null;
  const all = ks.flatMap((k) => [k.model, k.sim, k.hw].filter(Boolean));
  const W = 520, H = 230, L = 46, B = 26, R = 12, T = 10;
  const x0 = Math.log10(1 / 32), x1 = Math.log10(512), y1 = Math.log10(peak * 2), y0 = Math.min(Math.log10(Math.min(...all.map((p) => p.Plo ?? p.P)) / 3), y1 - 3);
  const X = (I) => L + ((Math.log10(Math.min(512, Math.max(1 / 32, I))) - x0) / (x1 - x0)) * (W - L - R), Y = (P) => H - B - ((Math.log10(P) - y0) / (y1 - y0)) * (H - B - T);
  const ridge = peak / bw;
  const roof = [[1 / 32, bw / 32], [ridge, peak], [512, peak]];
  const ticks = [1 / 16, 1 / 4, 1, 4, 16, 64, 256];
  const yt = [];
  for (let e = Math.ceil(y0); e <= y1; e++) yt.push(10 ** e);
  const labels = placeLabels(ks.map((k) => { const p = k.hw || k.sim || k.model; return { k, x: X(p.I), y: Y(p.P), text: k.c.x.name.replace(/^k_/, "") }; }), { left: L, right: W - R, top: T, bottom: H - B });
  const has = { model: ks.some((k) => k.model), sim: ks.some((k) => k.sim), hw: ks.some((k) => k.hw) };
  const key = [has.model && ["model", "model", `model: ${METHOD.model}`], has.sim && ["sim", "simulated", `simulated on ${sim?.name}: ${METHOD.sim()}`], has.hw && ["hw", "measured", `measured on ${hw?.name}: ${METHOD.stats("N")}; whisker: the 95 % CI`]].filter(Boolean);
  const on = (k) => k.c === sel;
  return (
    <div className="block">
      <header><h2>Roofline</h2><span className="sub">{t.name}: {t.peakTflops} TFLOP/s fp32, {t.bwGBs} GB/s; ridge at {ridge.toFixed(1)} flop/B</span></header>
      <div className="roofwrap">
        <svg className="roof" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Roofline: model, simulated and measured performance per kernel">
          {ticks.map((I) => <g key={I}><line className="gl" x1={X(I)} x2={X(I)} y1={T} y2={H - B} /><text className="ax" x={X(I)} y={H - 8} textAnchor="middle">{I < 1 ? "1/" + 1 / I : I}</text></g>)}
          {yt.map((P) => <g key={P}><line className="gl" x1={L} x2={W - R} y1={Y(P)} y2={Y(P)} /><text className="ax" x={L - 6} y={Y(P) + 3} textAnchor="end">{P >= 1000 ? P / 1000 + "T" : P >= 1 ? P : P.toFixed(2)}</text></g>)}
          <path className="rl" d={"M" + roof.map(([I, P]) => `${X(I)},${Y(Math.min(P, peak))}`).join(" L")} />
          <text className="ax" x={W - R} y={Y(peak) - 4} textAnchor="end">compute roof</text>
          {key.map(([c, w, title], i) => (
            <g key={c} className={cls("ser", c)} transform={`translate(${L + 10 + i * 74},${T + 10})`}><title>{title}</title>
              <circle className="mk" r={3.5} /><text className="ax" x={8} y={3}>{w}</text>
            </g>
          ))}
          {ks.map((k) => {
            const pts = [k.model, k.sim, k.hw].filter(Boolean);
            const name = k.c.x.name;
            return (
              <g key={name} className={cls("rk", on(k) && "on")} onClick={() => wb.select({ kernel: name, record: k.c.x.record || wb.sel.record })}>
                <title>{[name, `model ${k.c.model.text}`, `simulated ${k.c.sim.text}`, `measured ${k.c.hw.text}${k.c.hw.ci ? " " + k.c.hw.ci : ""}${k.c.hw.n ? ` (n=${k.c.hw.n})` : ""}`].join("\n")}</title>
                {pts.length > 1 ? <polyline className="lk" points={pts.map((p) => `${X(p.I)},${Y(p.P)}`).join(" ")} /> : null}
                {k.model ? <g className="ser model"><circle className={cls("mk", on(k) && k.top === "model" && "on")} cx={X(k.model.I)} cy={Y(k.model.P)} r={on(k) ? 4.5 : 3.5} /></g> : null}
                {k.sim ? <g className="ser sim"><circle className={cls("mk", on(k) && k.top === "sim" && "on")} cx={X(k.sim.I)} cy={Y(k.sim.P)} r={on(k) ? 4.5 : 3.5} /></g> : null}
                {k.hw ? <g className="ser hw"><line className="wk" x1={X(k.hw.I)} x2={X(k.hw.I)} y1={Y(k.hw.Plo)} y2={Y(k.hw.Phi)} /><circle className={cls("mk", on(k) && "on")} cx={X(k.hw.I)} cy={Y(k.hw.P)} r={on(k) ? 4.5 : 3.5} /></g> : null}
              </g>
            );
          })}
          {labels.map((l) => (
            <g key={l.k.c.x.name} className={cls("rlab", on(l.k) && "on")}>
              {l.moved ? <line className="lead" x1={l.x} y1={l.y} x2={l.lx + (l.anchor === "end" ? 2 : -2)} y2={l.ly - 3} /> : null}
              <text x={l.lx} y={l.ly} textAnchor={l.anchor}>{l.text}</text>
            </g>
          ))}
          <text className="ax" x={(L + W) / 2} y={H} textAnchor="middle">flop per DRAM byte</text>
        </svg>
      </div>
    </div>
  );
}

// Greedy label placement: each label tries the right of its mark, then shifted rows below and above, then the
// left side; the first box that overlaps neither a placed label nor the plot edge wins. 10 px Arial ≈ 5.6 px/char.
function placeLabels(items, box) {
  const placed = [], out = [];
  const hit = (a) => a.x0 < box.left || a.x1 > box.right || a.y0 < box.top || a.y1 > box.bottom + 8 || placed.some((b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1);
  for (const it of [...items].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const w = it.text.length * 5.6 + 2;
    let best = null;
    for (const side of ["start", "end"]) {
      for (const dy of [0, 11, -11, 22, -22, 33, -33, 44, -44]) {
        const lx = side === "start" ? it.x + 7 : it.x - 7, ly = it.y + 3 + dy;
        const r = side === "start" ? { x0: lx, x1: lx + w } : { x0: lx - w, x1: lx };
        const a = { ...r, y0: ly - 9, y1: ly + 2 };
        if (!hit(a)) { best = { a, lx, ly, anchor: side, moved: dy !== 0 }; break; }
      }
      if (best) break;
    }
    best ||= { a: { x0: it.x + 7, x1: it.x + 7 + w, y0: it.y - 6, y1: it.y + 5 }, lx: it.x + 7, ly: it.y + 3, anchor: "start", moved: false };
    placed.push(best.a);
    out.push({ ...it, ...best });
  }
  return out;
}

// ----------------------------------------------------------------------------- Tune
export function TuneView() {
  useLab("tune", "store", "device", "compile", "measure");
  const [strategy, setStrategy] = useState("spmcts");
  const [budget, setBudget] = useState(24);
  const T = wb.tuning;
  const n = wb.store.list({ device: wb.evidenceId }).length;
  return (
    <div className="page">
      <div className="stagewrap">
        <div className="toolbar">
          <Seg sm label="Strategy" value={strategy} onChange={setStrategy} items={[["spmcts", "SP-MCTS", "single-player Monte Carlo tree search over the program's forks"], ["sweep", "Sweep top 6", "per kernel, the cost model's six best options"], ["sweep-all", "Sweep all", "per kernel, every legal option (up to the budget)"]]} />
          <label className="lbl">budget <select value={budget} onChange={(e) => setBudget(+e.target.value)}>{[8, 16, 24, 32, 48, 64, 96, 128, 256].map((b) => <option key={b} value={b}>{b} programs</option>)}</select></label>
          {T?.running ? <Btn danger onClick={() => wb.stopTune()}>Stop</Btn> : <Btn primary onClick={() => wb.tune({ strategy, budget })} disabled={!wb.prog}>Tune on {wb.device.name}</Btn>}
          <span className="sp" />
          {T ? <span className="lbl">{T.running ? "tuning…" : T.error ? "stopped: " + T.error : "done"} · {T.history.length} programs{T.best ? " · best " + fmtUs(T.best.us) : ""}</span> : null}
        </div>
        <div className="scroll">
          {T && T.history.length ? <TuneChart T={T} /> : <div className="block"><p className="note">Tuning compiles program after program, each with different fork choices, and measures every one on the selected device. Every measured kernel becomes a record, so the next ordinary compile can decide by evidence without measuring. SP-MCTS searches the whole program's fork tree (max-Q backup, UCB normalized by the best time so far, patience); Sweep measures the cost model's top options per kernel.</p></div>}
          {T?.best ? (
            <div className="block">
              <header><h2>Best program</h2><span className="sub">{fmtUs(T.best.us)} · found at #{T.best.i}</span></header>
              <ul className="plain">{T.best.rows.map((r, i) => <li key={i}>{r}</li>)}</ul>
            </div>
          ) : null}
          <div className="block">
            <header><h2>Records</h2><span className="sub">{n} on {wb.evidenceId} · {wb.store.size} stored</span></header>
            <p className="note">Measurements and tuning runs are stored as records. The Evidence view lists them with their samples and status, and imports, exports and forgets them.</p>
            <div className="actions"><Btn sm onClick={() => wb.showView("evidence")}>Open Evidence</Btn></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TuneChart({ T }) {
  const h = T.history.filter((x) => isFinite(x.us));
  if (!h.length) return null;
  const W = 520, H = 170, L = 50, B = 22, R = 10, Tp = 10;
  const max = Math.max(...h.map((x) => x.us)), min = Math.min(...h.map((x) => x.us));
  const lo = Math.log(min * 0.9), hi = Math.log(max * 1.1);
  const X = (i) => L + (i / Math.max(1, T.budget - 1)) * (W - L - R), Y = (us) => Tp + ((hi - Math.log(us)) / Math.max(1e-9, hi - lo)) * (H - B - Tp);
  let best = Infinity;
  const bestPts = T.history.map((x) => { if (x.us < best) best = x.us; return [X(x.i), Y(best)]; }).filter(([, y]) => isFinite(y));
  return (
    <div className="block">
      <header><h2>Search</h2><span className="sub">each dot is one compiled and measured program</span></header>
      <svg className="roof" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Tuning progress">
        {[min, Math.sqrt(min * max), max].map((v, i) => <g key={i}><line className="gl" x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} /><text className="ax" x={L - 6} y={Y(v) + 3} textAnchor="end">{fmtUs(v)}</text></g>)}
        <path className="rl" d={"M" + bestPts.map((p) => p.join(",")).join(" L")} />
        {h.map((x) => <circle key={x.i} className={cls("td", T.best && x.i === T.best.i && "on")} cx={X(x.i)} cy={Y(x.us)} r={T.best && x.i === T.best.i ? 4.5 : 2.6}><title>{`#${x.i} ${fmtUs(x.us)}\n${x.rows.join("\n")}`}</title></circle>)}
        <text className="ax" x={W - R} y={H - 4} textAnchor="end">program # (budget {T.budget})</text>
      </svg>
    </div>
  );
}

// ----------------------------------------------------------------------------- Devices
// the measurement protocol of a real device (guide §28): repetitions are the statistical unit, each a fresh
// context; launches are timed within a repetition after warm-up; the seed shuffles the kernel order
const PROTOCOL = [
  ["reps", "repetitions", 1, "independent repetitions; the median and its CI are taken over these"],
  ["warmup", "warm-up launches", 0, "untimed launches before timing, in each repetition"],
  ["launches", "timed launches", 1, "timed launches per repetition; their median is the repetition's sample"],
  ["seed", "order seed", 0, "seeds the shuffled kernel order of each repetition"],
];
function ProtocolBlock({ d }) {
  return (
    <div className="block">
      <header><h2>Protocol</h2><span className="sub">applies to the next Measure and Tune</span></header>
      <div className="protocol">
        {PROTOCOL.map(([key, label, min, help]) => (
          <label key={key} title={help}><span>{label}</span>
            <input className="filter" type="number" min={min} step={1} value={d.protocol[key]} onChange={(e) => { const v = Math.round(+e.target.value); if (Number.isFinite(v) && v >= min) wb.setProtocol(d, { [key]: v }); }} aria-label={label} />
          </label>
        ))}
      </div>
      <p className="note">{d.protocol.reps} × {d.protocol.launches} timed launches per kernel ({d.protocol.warmup} warm-up). Records with fewer completed repetitions than asked are invalid.</p>
    </div>
  );
}

export function DevicesView() {
  useLab("device", "measure", "compile");
  const [paste, setPaste] = useState("");
  const [ncu, setNcu] = useState(false);
  const fileRef = useRef(null);
  const d = wb.device;
  const cuda = wb.devices.find((x) => x.kind === "cuda");
  const doImport = (text) => {
    try { const rec = wb.importResults(text); wb.setDevice(cuda.id, { quiet: true }); wb.toast(`Imported ${rec.kernels.length} kernel results: ${fmtUs(rec.total)}`); setPaste(""); wb.showView("perf"); }
    catch (e) { wb.toast("Could not import: " + e.message, "bad"); }
  };
  const onFile = async (e) => { const f = e.target.files?.[0]; if (f) doImport(await f.text()); e.target.value = ""; };
  const bundleName = `${wb.preset?.id || "project"}-bundle.json`;
  return (
    <div className="page">
      <div className="stagewrap">
        <div className="scroll">
          <div className="block">
            <header><h2>Devices</h2><span className="sub">the one you pick decides schedules, runs Measure and Tune, and keys the evidence</span></header>
            <div className="devlist" role="radiogroup" aria-label="Device">
              {wb.devices.map((x) => (
                <button key={x.id} type="button" role="radio" aria-checked={x.id === d.id} className={cls("devrow", x.id === d.id && "on")} onClick={() => wb.setDevice(x.id)}>
                  <span className={cls("dot", x.kind === "sim" ? "sim" : x.status === "ready" ? "live" : "off")} />
                  <b>{x.kind === "sim" ? x.name : x.label}</b>
                  <small>{x.kind === "sim" ? `${x.spec.arch} · ${x.spec.sms} SMs · ${x.spec.bwGBs} GB/s · simulated` : x.status}</small>
                  {wb.measures[x.id] ? <span className="t">{fmtUs(wb.measures[x.id].total)}</span> : null}
                </button>
              ))}
            </div>
          </div>
          {cuda ? (
            <div className="block cudablk">
              <header><h2>A real CUDA GPU</h2><span className="sub">{cuda.status}</span></header>
              <p className="note">This page cannot reach other machines, so CUDA runs go through <code>kiln_runner.py</code> on the GPU box. It compiles each kernel with nvcc, times it with CUDA events (median of 50 after 5 warm-ups), optionally profiles it with Nsight Compute, and returns sampled outputs that are checked here against the reference.</p>
              <ol className="steps">
                <li><b>Get the runner.</b> <Btn sm onClick={() => saveText("kiln_runner.py", RUNNER)}>Download kiln_runner.py</Btn> <span className="dim">needs Python 3, numpy and the CUDA toolkit</span></li>
                <li><b>Export the compiled kernels.</b> <Btn sm onClick={() => { const j = wb.bundleJSON({ ncu }); if (j) saveText(bundleName, j); }} disabled={!wb.prog}>Download {bundleName}</Btn> <Tog on={ncu} onClick={() => setNcu(!ncu)} title="Ask the runner to profile each kernel with ncu">Nsight metrics</Tog></li>
                <li><b>Run it there.</b> <code className="cmd">python kiln_runner.py run {bundleName} -o results.json</code> <Btn sm onClick={() => copyText(`python kiln_runner.py run ${bundleName} -o results.json`, "the command")}>Copy</Btn></li>
                <li><b>Bring the results back.</b> <Btn sm onClick={() => fileRef.current?.click()} disabled={!wb.prog}>Import results.json…</Btn><input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={onFile} /></li>
              </ol>
              <textarea className="pastebox" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="…or paste the runner's JSON output here" rows={3} aria-label="Runner results" />
              {paste.trim() ? <div className="actions"><Btn sm primary onClick={() => doImport(paste)}>Import pasted results</Btn></div> : null}
              <p className="note">Live mode: on the GPU box run <code>python kiln_runner.py serve kiln-workbench.html</code> (the standalone page is in the source zip) and open the address it prints. Served that way, the CUDA device connects directly and Measure and Tune run on the GPU.</p>
            </div>
          ) : null}
        </div>
      </div>
      <aside className="side">
        <div className="block">
          <header><h2>{d.kind === "sim" ? d.name : d.label}</h2></header>
          <Kv rows={Object.entries(d.describe()).filter(([key]) => key !== "note" && !(key === "protocol" && d.protocol)).map(([key, v]) => [key, typeof v === "boolean" ? (v ? "yes" : "no") : String(v)])} />
          {d.describe().note ? <p className="note">{d.describe().note}</p> : null}
          {d.kind !== "sim" ? <Btn sm onClick={async () => { await d.probe(); wb.bump("device"); wb.toast(d.status, d.status === "ready" ? "" : "bad"); }}>Probe again</Btn> : null}
        </div>
        <div className="block">
          <header><h2>Identity</h2><span className="sub">every record carries this id; another fingerprint is another device</span></header>
          <Kv rows={[
            ["evidence id", d.evidenceId ? <span className="mono" title={d.evidenceId}>{d.evidenceId}</span> : <span className="dim" title="a real device gets its id from its fingerprint when it is probed">— probe first</span>],
            ["records", wb.store.list({ device: wb.evidenceId }).length],
            ...Object.entries(d.fingerprint || {}).map(([key, v]) => [key, <span className="mono" title={String(v)}>{String(v).length > 22 ? String(v).slice(0, 22) + "…" : String(v) || "—"}</span>]),
          ]} />
        </div>
        {d.protocol ? <ProtocolBlock d={d} /> : null}
        <div className="block">
          <header><h2>Target the compiler sees</h2></header>
          <Kv rows={[["max threads/block", d.target.maxThreadsPerBlock], ["smem/block", fmtBytes(d.target.smemPerBlock)], ["SMs", d.target.sms], ["FP32 peak", d.target.peakTflops + " TFLOP/s"], ["bandwidth", d.target.bwGBs + " GB/s"]]} />
          <p className="note">Schedule legality (block size, shared memory) and the cost model use these numbers, so changing the device can change the compiled program.</p>
        </div>
      </aside>
    </div>
  );
}
