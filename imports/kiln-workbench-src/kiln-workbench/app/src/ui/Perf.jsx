import React, { useRef, useState } from "react";
import { wb, RUNNER } from "./wb.js";
import { useLab, Btn, Seg, Tog, Kv, Meter, Spark, Empty, cls } from "./common.jsx";
import { fmtUs, fmtBytes, fmtNum } from "../core/util.js";
import { knobs as KN } from "../core/kiln.js";
import { saveText, copyText } from "./Kernels.jsx";

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
export function PerfView() {
  useLab("measure", "compile", "device", "sel");
  const [all, setAll] = useState(false);
  const m = wb.measures[wb.deviceId];
  const s = wb.summary();
  const sel = m?.kernels.find((x) => x.name === wb.sel.kernel) || m?.kernels[0];
  const hist = wb.history.filter((h) => h.device === wb.deviceId && h.preset === wb.preset?.id && isFinite(h.total));
  const measureAll = async () => {
    setAll(true);
    for (const d of wb.devices.filter((x) => x.kind === "sim")) await wb.measure({ device: d, quiet: true });
    setAll(false);
    wb.toast("Measured on every simulated GPU");
  };
  const others = Object.values(wb.measures).filter((r) => r.preset === wb.preset?.id);
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
          {!wb.prog ? <Empty>{wb.run?.ok ? "This pipeline does not end in GPU kernels." : "Compile the project first."}</Empty>
            : !m ? <Empty>Measure to run every kernel on {wb.device.label}: time, metrics, and a check of sampled outputs against the reference.</Empty> : (
              <>
                <div className="perfhead">
                  <div className="bignum"><b>{fmtUs(m.total)}</b><span>{m.kernels.length} kernel{m.kernels.length === 1 ? "" : "s"} on {m.deviceName}</span></div>
                  {hist.length > 1 ? <div className="histspark"><Spark values={hist.map((h) => h.total)} h={36} /><span className="lbl">last {hist.length} measurements</span></div> : null}
                </div>
                <table className="rt perft">
                  <thead><tr><th>kernel</th><th className="num">time</th><th className="mcol">share</th><th>bound</th><th className="num">occ.</th><th className="num">GB/s</th><th className="num">GFLOP/s</th><th className="num" title="global-load sectors per warp request (4 is perfectly coalesced fp32)">sect/req</th><th className="num" title="extra shared-memory wavefronts per request">bank</th><th className="num" title="branch instructions where a warp diverged">div.</th><th>check</th></tr></thead>
                  <tbody>
                    {m.kernels.map((x) => {
                      const mt = x.metrics || {}, bad = x.error || x.check?.ok === false;
                      return (
                        <tr key={x.name} className={cls("clickable", sel === x && "sel", bad && "badrow")} onClick={() => wb.select({ kernel: x.name })}>
                          <td className="nm">{x.name}</td><td className="num">{x.error ? "error" : fmtUs(x.us)}</td>
                          <td className="mcol"><Meter f={isFinite(x.us) ? x.us / m.total : 0} /></td>
                          <td>{mt.bound || "—"}</td><td className="num">{pct(mt.occupancy)}</td><td className="num">{num(mt.gbs, 0)}</td><td className="num">{num(mt.gflops, 0)}</td>
                          <td className={cls("num", mt.ldSectorsPerReq > 8 && "bad")}>{num(mt.ldSectorsPerReq)}</td><td className={cls("num", mt.bankConflicts > 0.5 && "bad")}>{num(mt.bankConflicts, 2)}</td><td className="num">{mt.divergence != null ? pct(mt.divergence) : "—"}</td>
                          <td>{bad ? <span className="bad">✕</span> : "✓"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <Roofline m={m} sel={sel} />
                {others.length > 1 ? (
                  <div className="block">
                    <header><h2>Across devices</h2><span className="sub">this project's last measurement on each</span></header>
                    <table className="rt">
                      <thead><tr><th>device</th><th className="num">total</th><th>slowest kernel</th><th /></tr></thead>
                      <tbody>{others.sort((a, b) => a.total - b.total).map((r) => { const slow = r.kernels.reduce((a, b) => (b.us > a.us ? b : a)); return <tr key={r.device} className={cls(r.device === wb.deviceId && "sel")}><td>{r.deviceName}</td><td className="num">{fmtUs(r.total)}</td><td>{slow.name} · {fmtUs(slow.us)}</td><td><Meter f={Math.min(...others.map((o) => o.total)) / r.total} /></td></tr>; })}</tbody>
                    </table>
                  </div>
                ) : null}
              </>
            )}
        </div>
      </div>
      <aside className="side">
        {sel ? <KernelMetrics x={sel} m={m} /> : <div className="block"><p className="note">Simulated devices report Nsight-style metrics from a lockstep SIMT simulation of sampled blocks; WebGPU and CUDA report real time, and CUDA adds Nsight Compute metrics when the runner has ncu.</p></div>}
      </aside>
    </div>
  );
}

function KernelMetrics({ x, m }) {
  const mt = x.metrics || {};
  const parts = mt.parts ? Object.entries(mt.parts).filter(([, v]) => isFinite(v)) : [];
  const pmax = Math.max(1e-9, ...parts.map(([, v]) => v));
  return (
    <>
      <div className="block">
        <header><h2>{x.name}</h2><span className="sub">{x.row}</span></header>
        {x.error ? <p className="srow-msg">{x.error}</p> : null}
        {x.check ? <p className={x.check.ok ? "note" : "srow-msg"}>{x.check.ok ? `✓ ${x.check.n || ""} sampled outputs match the reference` : "✕ " + x.check.message}</p> : null}
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
          ...Object.entries(mt).filter(([key, v]) => key.startsWith("ncu_") || key.includes("__")).map(([key, v]) => [key.replace(/^ncu_/, ""), String(v)]),
        ]} />
      </div>
      {parts.length ? (
        <div className="block">
          <header><h2>Where the time goes</h2><span className="sub">model lower bounds</span></header>
          {parts.map(([key, v]) => <div key={key} className="partrow"><span>{key}</span><Meter f={v / pmax} bad={key === mt.bound} /><span className="num">{fmtUs(v)}</span></div>)}
          <p className="note">The longest bar bounds the kernel; launch overhead and partial waves add to it.</p>
        </div>
      ) : null}
    </>
  );
}

function Roofline({ m, sel }) {
  const t = wb.devices.find((d) => d.id === m.device)?.target || wb.device.target;
  const pts = m.kernels.filter((x) => x.metrics?.flops && x.metrics?.dram && isFinite(x.us)).map((x) => ({ x, I: x.metrics.flops / x.metrics.dram, P: x.metrics.flops / x.us / 1e3 }));
  if (!pts.length) return null;
  const peak = t.peakTflops * 1e3, bw = t.bwGBs;
  const W = 520, H = 220, L = 46, B = 26, R = 12, T = 10;
  const x0 = Math.log10(1 / 32), x1 = Math.log10(512), y1 = Math.log10(peak * 2), y0 = Math.min(Math.log10(Math.min(...pts.map((p) => p.P)) / 3), y1 - 3);
  const X = (I) => L + ((Math.log10(I) - x0) / (x1 - x0)) * (W - L - R), Y = (P) => H - B - ((Math.log10(P) - y0) / (y1 - y0)) * (H - B - T);
  const ridge = peak / bw;
  const roof = [[1 / 32, bw / 32], [ridge, peak], [512, peak]];
  const ticks = [1 / 16, 1 / 4, 1, 4, 16, 64, 256];
  const yt = [];
  for (let e = Math.ceil(y0); e <= y1; e++) yt.push(10 ** e);
  return (
    <div className="block">
      <header><h2>Roofline</h2><span className="sub">{t.name}: {t.peakTflops} TFLOP/s fp32, {t.bwGBs} GB/s; ridge at {ridge.toFixed(1)} flop/B</span></header>
      <div className="roofwrap">
        <svg className="roof" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Roofline">
          {ticks.map((I) => <g key={I}><line className="gl" x1={X(I)} x2={X(I)} y1={T} y2={H - B} /><text className="ax" x={X(I)} y={H - 8} textAnchor="middle">{I < 1 ? "1/" + 1 / I : I}</text></g>)}
          {yt.map((P) => <g key={P}><line className="gl" x1={L} x2={W - R} y1={Y(P)} y2={Y(P)} /><text className="ax" x={L - 6} y={Y(P) + 3} textAnchor="end">{P >= 1000 ? P / 1000 + "T" : P >= 1 ? P : P.toFixed(2)}</text></g>)}
          <path className="rl" d={"M" + roof.map(([I, P]) => `${X(I)},${Y(Math.min(P, peak))}`).join(" L")} />
          <text className="ax" x={W - R} y={Y(peak) - 4} textAnchor="end">compute roof</text>
          {pts.map((p) => (
            <g key={p.x.name} className={cls("rp", p.x === sel && "on")} onClick={() => wb.select({ kernel: p.x.name })}>
              <circle cx={X(p.I)} cy={Y(p.P)} r={p.x === sel ? 5 : 3.5} />
              <text x={X(p.I) + 7} y={Y(p.P) + 3}>{p.x.name.replace(/^k_/, "")}</text>
            </g>
          ))}
          <text className="ax" x={(L + W) / 2} y={H} textAnchor="middle" dy="-0">flop per DRAM byte</text>
        </svg>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------- Tune
export function TuneView() {
  useLab("tune", "store", "device", "compile", "measure");
  const [strategy, setStrategy] = useState("spmcts");
  const [budget, setBudget] = useState(24);
  const [mineOnly, setMineOnly] = useState(true);
  const fileRef = useRef(null);
  const T = wb.tuning;
  const ids = new Set(wb.prog?.kernels.map((x) => x.identity) || []);
  const rows = wb.store.list({ device: wb.deviceId }).filter((r) => !mineOnly || ids.has(r.identity));
  const importEv = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try { const n = wb.store.import(JSON.parse(await f.text())); wb.toast(`Imported ${n} evidence rows`); wb.compile(); } catch (err) { wb.toast("Not an evidence file: " + err.message, "bad"); }
    e.target.value = "";
  };
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
          {T && T.history.length ? <TuneChart T={T} /> : <div className="block"><p className="note">Tuning compiles program after program, each with different fork choices, and measures every one on the selected device. Every measured kernel becomes evidence, so the next ordinary compile picks the fastest known schedule without measuring. SP-MCTS searches the whole program's fork tree (max-Q backup, UCB normalized by the best time so far, patience); Sweep measures the cost model's top options per kernel.</p></div>}
          {T?.best ? (
            <div className="block">
              <header><h2>Best program</h2><span className="sub">{fmtUs(T.best.us)} · found at #{T.best.i}</span></header>
              <ul className="plain">{T.best.rows.map((r, i) => <li key={i}>{r}</li>)}</ul>
            </div>
          ) : null}
          <div className="block">
            <header>
              <h2>Evidence</h2><span className="sub">{wb.store.size} rows in all · {rows.length} shown for {wb.device.name}</span><span className="sp" />
              <Tog on={mineOnly} onClick={() => setMineOnly(!mineOnly)}>This program</Tog>
            </header>
            {rows.length ? (
              <table className="rt">
                <thead><tr><th>kernel</th><th>schedule</th><th className="num">time</th><th>by</th><th>check</th><th /></tr></thead>
                <tbody>
                  {rows.slice(0, 300).map((r, i) => {
                    const best = wb.store.best(r.device, r.identity) === r;
                    const used = wb.run?.decisions.some((d) => d.key === r.identity && KN.canonical(d.knobs || {}) === KN.canonical(r.knobs));
                    return (
                      <tr key={i} className={cls(r.ok === false && "badrow", used && "sel")}>
                        <td className="nm">{r.name}</td><td>{r.row}</td><td className="num">{fmtUs(r.us)}{best ? " ★" : ""}</td><td>{r.by}</td><td>{r.ok === false ? "✕" : "✓"}</td>
                        <td>{used ? <span className="tag">in use</span> : null}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : <p className="note">No evidence for {mineOnly ? "this program on " : ""}{wb.device.name} yet. Measure or tune to gather some.</p>}
            <div className="actions">
              <Btn sm onClick={() => saveText("kiln-evidence.json", JSON.stringify(wb.store.toJSON(), null, 1))} disabled={!wb.store.size}>Export evidence</Btn>
              <Btn sm onClick={() => fileRef.current?.click()}>Import evidence…</Btn>
              <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={importEv} />
              <Btn sm danger onClick={() => { wb.store.clear({ device: wb.deviceId }); wb.compile(); }} disabled={!rows.length}>Forget {wb.device.name}</Btn>
            </div>
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
          <Kv rows={Object.entries(d.describe()).filter(([key]) => key !== "note").map(([key, v]) => [key, typeof v === "boolean" ? (v ? "yes" : "no") : String(v)])} />
          {d.describe().note ? <p className="note">{d.describe().note}</p> : null}
          {d.kind !== "sim" ? <Btn sm onClick={async () => { await d.probe(); wb.bump("device"); wb.toast(d.status, d.status === "ready" ? "" : "bad"); }}>Probe again</Btn> : null}
        </div>
        <div className="block">
          <header><h2>Target the compiler sees</h2></header>
          <Kv rows={[["max threads/block", d.target.maxThreadsPerBlock], ["smem/block", fmtBytes(d.target.smemPerBlock)], ["SMs", d.target.sms], ["FP32 peak", d.target.peakTflops + " TFLOP/s"], ["bandwidth", d.target.bwGBs + " GB/s"]]} />
          <p className="note">Schedule legality (block size, shared memory) and the cost model use these numbers, so changing the device can change the compiled program.</p>
        </div>
      </aside>
    </div>
  );
}
