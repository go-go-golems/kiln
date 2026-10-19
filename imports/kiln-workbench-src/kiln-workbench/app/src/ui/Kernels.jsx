import React, { useState } from "react";
import { wb } from "./wb.js";
import { useLab, Btn, Tabs, Kv, Empty, cls } from "./common.jsx";
import { fmtUs, fmtBytes, numel } from "../core/util.js";
import { IrText } from "./Compiler.jsx";
import { highlightC } from "./highlight.js";

export async function saveText(filename, text) {
  const dl = await window.claude?.use?.("downloads").catch(() => null);
  if (dl) { try { await dl.save({ filename, data: text }); wb.toast("Saved " + filename); return true; } catch { wb.toast("The download was declined", "bad"); return false; } }
  try { await navigator.clipboard.writeText(text); wb.toast(`Downloads are not available here; copied ${filename} instead`); } catch { wb.toast("Downloads are not available here", "bad"); }
  return false;
}
export async function copyText(text, what = "text") {
  try { await navigator.clipboard.writeText(text); wb.toast("Copied " + what); } catch { wb.toast("Copying was refused; select the text instead", "bad"); }
}

export function KernelsView() {
  useLab("compile", "sel", "measure", "device");
  const [tab, setTab] = useState("cuda");
  const prog = wb.prog;
  if (!wb.run) return <div className="stagewrap"><Empty>Compile a project to see its kernels.</Empty></div>;
  if (!prog) {
    const last = wb.run.irOrder[wb.run.irOrder.length - 1];
    return <div className="stagewrap"><Empty>{wb.run.ok ? `This pipeline ends in the ${last} IR, not in GPU kernels. Its output is in the IR view, and the Code view's Run button evaluates it.` : "The compile stopped before any kernels were made. See the IR view for where."}</Empty></div>;
  }
  const ks = prog.kernels;
  const kern = ks.find((x) => x.name === wb.sel.kernel) || ks[0];
  const m = wb.measures[wb.deviceId];
  const mk = (kn) => m?.kernels.find((x) => x.identity === kn.identity && x.row === kn.row);
  const dec = (kn) => wb.run.decisions.find((d) => d.key === kn.identity && d.knobs);
  const model = (kn) => { const d = dec(kn); return d?.by === "model" ? d.score : null; };
  const src = tab === "cuda" ? kern.cuda : tab === "wgsl" ? kern.wgsl : null;
  const level = { kir: "kernel", tile: "tile", loop: "loop" }[tab];
  const g = level ? wb.run.at(level) : null;
  const r = mk(kern);
  return (
    <div className="page col kernels">
      <div className="tablewrap ktable">
        <table className="rt">
          <thead><tr><th>kernel</th><th>schedule</th><th className="num">grid × block</th><th className="num">smem</th><th className="num">model</th><th className="num">{m ? m.deviceName.split(" · ")[0] : "measured"}</th><th>check</th></tr></thead>
          <tbody>
            {ks.map((kn) => {
              const x = mk(kn), bad = x && (x.error || x.check?.ok === false);
              return (
                <tr key={kn.id} className={cls("clickable", kn === kern && "sel", bad && "badrow")} onClick={() => wb.select({ kernel: kn.name, node: kn.id })}>
                  <td className="nm">{kn.name}</td><td>{kn.row}</td><td className="num">{kn.K.grid} × {kn.K.block}</td><td className="num">{kn.K.smemBytes ? fmtBytes(kn.K.smemBytes) : "—"}</td>
                  <td className="num">{model(kn) != null ? fmtUs(model(kn)) : "—"}</td><td className="num">{x ? (x.error ? "error" : fmtUs(x.us)) : "—"}</td><td>{x ? (bad ? "✕" : "✓") : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Tabs value={tab} onChange={setTab} items={[["cuda", "CUDA"], ["wgsl", "WGSL"], ["kir", "Kernel IR"], ["tile", "Tile"], ["loop", "Loop IR"], ["launch", "Launch"]]}
        right={<span className="tabbtns">{src ? <><Btn sm onClick={() => copyText(src, tab === "cuda" ? "the CUDA" : "the WGSL")}>Copy</Btn><Btn sm onClick={() => saveText(`${kern.name}.${tab === "cuda" ? "cu" : "wgsl"}`, src)}>Download</Btn></> : null}</span>} />
      <div className="scroll">
        {src ? <pre className="irtext csrc" dangerouslySetInnerHTML={{ __html: highlightC(src) }} />
          : g ? <IrText text={g.printNode(kern.id)} g={g} />
          : tab === "launch" ? (
            <div className="padded launch">
              <Kv rows={[
                ["kernel", kern.name], ["schedule", kern.row], ["grid", kern.K.grid + " blocks"], ["block", kern.K.block + " threads"], ["shared memory", fmtBytes(kern.K.smemBytes || 0)],
                ["inputs", kern.inShapes.map((s, i) => `${kern.args[i]} ${s.join("×")}`).join(", ")], ["output", kern.shape.join("×") + ` (${numel(kern.shape).toLocaleString()} floats)`], ["unique bytes", fmtBytes(kern.bytes)],
                r?.metrics?.regs != null ? ["registers (est.)", r.metrics.regs] : null, r?.metrics?.occupancy != null ? ["occupancy", (r.metrics.occupancy * 100).toFixed(0) + "% · " + r.metrics.limiter + "-limited"] : null,
                r ? ["time", fmtUs(r.us) + " on " + m.deviceName] : null, r?.metrics?.bound ? ["bound by", r.metrics.bound] : null,
              ]} />
              <p className="note">Inputs on every device are the same seeded uniform values in [−1, 1); outputs are checked at sampled indices against the Loop IR reference.</p>
            </div>
          ) : <Empty>Not available at this level.</Empty>}
      </div>
    </div>
  );
}
