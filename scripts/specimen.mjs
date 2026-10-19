#!/usr/bin/env node
// Writes a specimen page of the workbench's visual language (tokens, provenance marks, value cells, stamps,
// the title block, chart series) styled by the real stylesheets, for screenshots and review.
//   node scripts/specimen.mjs [out.html]      default apps/workbench/dist/specimen.html
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const ui = new URL("../apps/workbench/src/ui/", import.meta.url).pathname;
const out = process.argv[2] || new URL("../apps/workbench/dist/specimen.html", import.meta.url).pathname;
const css = ["tokens", "base", "chrome", "views", "evidence", "utilities"].map((f) => readFileSync(ui + f + ".css", "utf8")).join("\n");

const prov = [
  ["observed", "a hardware sample"], ["derived", "a statistic of observed values"], ["heuristic", "cost model or simulator"],
  ["illustrative", "made-up data"], ["unknown", "missing"], ["bad", "invalid"],
];
const swatches = ["bg", "fill", "fill-2", "ink", "ink-2", "ink-3", "hair", "hair-strong", "accent", "sel"];

// one series per evidence source: x positions shared, y in px from the top
const pts = [[30, 90], [90, 70], [150, 58], [210, 52], [270, 49]];
const series = (cls, dy, on) => `<g class="ser ${cls}">
  <polyline class="ln" points="${pts.map(([x, y]) => `${x},${y + dy}`).join(" ")}"/>
  ${cls === "hw" ? pts.map(([x, y]) => `<line class="wk" x1="${x}" x2="${x}" y1="${y + dy - 5}" y2="${y + dy + 5}"/>`).join("") : ""}
  ${pts.map(([x, y], i) => `<circle class="mk${on === i ? " on" : ""}" cx="${x}" cy="${y + dy}" r="3.5"/>`).join("")}
</g>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kiln specimen</title><style>${css}
body { overflow: auto; }
.spec { padding: 24px 28px; display: grid; gap: 28px; max-width: 980px; }
.spec h2 { font-size: var(--fs-m); margin: 0 0 10px; }
.sw { display: flex; flex-wrap: wrap; gap: 10px; }
.sw div { width: 82px; font-size: var(--fs-xs); color: var(--ink-2); }
.sw i { display: block; height: 34px; border: 1px solid var(--hair); margin-bottom: 4px; }
.marks { display: grid; grid-template-columns: repeat(3, max-content); gap: 8px 36px; font-size: var(--fs-s); }
.marks span { display: inline-flex; gap: 8px; align-items: center; }
.row { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; font-size: var(--fs-s); }
svg text { font: var(--fs-xs) var(--sans); fill: var(--ink-2); }
</style></head><body><div class="spec">
<section><h2>Tokens</h2><div class="sw">${swatches.map((t) => `<div><i style="background:var(--${t})"></i>--${t}</div>`).join("")}</div></section>
<section><h2>Provenance marks</h2><div class="marks">${prov.map(([k, d]) => `<span><i class="prov ${k}" title="${d}"></i><b>${k}</b> <span class="dim">${d}</span></span>`).join("")}</div></section>
<section><h2>Value cells</h2><table class="rt"><thead><tr><th>kernel</th><th>model</th><th>simulated</th><th>measured</th><th>effect</th></tr></thead><tbody>
<tr><td>k_matmul_reduce</td><td><span class="val"><i class="prov heuristic"></i>99.2 µs</span></td><td><span class="val"><i class="prov heuristic"></i>104 µs</span></td><td><span class="val"><i class="prov derived"></i>24.3 µs <span class="ci">±0.4</span> <span class="n">n=31</span></span></td><td><span class="val"><i class="prov derived"></i>1.42× <span class="ci">[1.38, 1.47]</span></span></td></tr>
<tr><td>k_ew_softmax</td><td><span class="val"><i class="prov heuristic"></i>5.0 µs</span></td><td><span class="val missing"><i class="prov unknown"></i>—</span></td><td><span class="val stale"><i class="prov observed"></i>6.1 µs</span></td><td><span class="val missing"><i class="prov unknown"></i>undecided</span></td></tr>
</tbody></table></section>
<section><h2>Stamps</h2><div class="row"><span class="stamp">exploratory</span><span class="stamp">simulated</span><span class="stamp solid">qualified</span><span class="stamp solid">supported</span><span class="stamp bad">refuted</span><span class="stamp bad">unqualified</span><span class="stamp bad">invalid</span></div></section>
<section><h2>Title block</h2><div class="titleblock"><div><label>record</label><b>run:7f3a…c21e</b></div><div><label>device</label><b>RTX 5090 · sim</b></div><div><label>program</label><b>sha256:94be…0d1a</b></div><div><label>samples</label><b>31 × 3</b></div><div><label>clock</label><b>locked 2.1 GHz</b></div><div><label>verdict</label><b><span class="stamp solid">supported</span></b></div></div></section>
<section><h2>Chart series</h2><svg width="320" height="150" viewBox="0 0 320 150">
<defs><pattern id="half" width="1" height="1" patternContentUnits="objectBoundingBox"><rect width="1" height="1" fill="var(--bg)"/><rect width="0.5" height="1" fill="var(--ink)"/></pattern></defs>
${series("model", -30, -1)}${series("sim", 0, -1)}${series("hw", 30, 4)}
<text x="290" y="22">model</text><text x="290" y="52">sim</text><text x="290" y="82">hw</text></svg></section>
<section><h2>Stale block</h2><div class="block stale padded" style="max-width:420px">Evidence recorded against the previous program. Re-measure to refresh.</div></section>
</div></body></html>`;

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(out);
