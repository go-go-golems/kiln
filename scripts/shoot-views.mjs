#!/usr/bin/env node
// Captures the standard set of workbench screenshots used by the diary: the default layout in light and
// dark, a measured program, the trace, the knobs table, the graph after tuning, the Evidence view and Knobs
// with measured options, Perf, Evidence and Devices after a real WebGPU measurement, and phone width.
//   node scripts/shoot-views.mjs <page.html> <out-dir> [prefix] [--only name,name]
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { withPage } from "./shoot.mjs";

// W-05 measured on the simulated RTX 5090, then the model's top options swept: records to show in Evidence and Knobs
const W05_SWEPT = ['wb.load("W-05")', 'wb.setDevice("sim:rtx5090")', 'wb.useLayout("perf")', "wb.measure()", 'wb.tune({ strategy: "sweep", budget: 8 })'];
// W-05 simulated, then measured on this machine's GPU through WebGPU (the shots that need a real adapter)
const W05_GPU = ['wb.load("W-05")', 'wb.setDevice("sim:rtx5090")', 'wb.useLayout("perf")', "wb.measure()", 'wb.setDevice("webgpu")', "wb.measure()"];
const SHOTS = [
  { name: "default-light-1600", steps: [] },
  { name: "default-dark-1600", dark: true, steps: [] },
  { name: "perf-light-1600", steps: ['wb.load("W-09")', 'wb.useLayout("perf")', "wb.measure()", 'wb.showView("code")'] },
  { name: "trace-light-1600", steps: ['wb.load("W-09")', 'wb.useLayout("default")', 'wb.showView("trace")', 'wb.showView("knobs")'] },
  { name: "knobs-light-1600", steps: ['wb.load("W-21")', 'wb.useLayout("compiler")', 'wb.showView("knobs")', 'wb.showView("reference")'] },
  { name: "graph-light-1600", steps: ['wb.load("W-10")', 'wb.useLayout("compiler")', 'wb.showView("graph")', "wb.tune({ budget: 16 })", 'wb.showView("tune")'] },
  { name: "evidence-light-1600", steps: [...W05_SWEPT, 'wb.showView("evidence")'] },
  { name: "evidence-dark-1600", dark: true, steps: [...W05_SWEPT, 'wb.showView("evidence")'] },
  { name: "knobs-measured-light-1600", steps: [...W05_SWEPT, 'wb.showView("knobs")'] },
  { name: "perf-webgpu-light-1600", webgpu: true, steps: [...W05_GPU, 'wb.showView("perf")'] },
  { name: "evidence-webgpu-light-1600", webgpu: true, steps: [...W05_GPU, 'wb.showView("evidence")'] },
  { name: "devices-webgpu-light-1600", webgpu: true, steps: [...W05_GPU, 'wb.useLayout("one")', 'wb.showView("devices")'] },
  { name: "phone-390", size: "390x844", steps: [] },
  { name: "evidence-phone-390", size: "390x844", steps: [...W05_SWEPT, 'wb.showView("evidence")'] },
  { name: "phone-dark-390", size: "390x844", dark: true, steps: ['wb.load("W-09")', 'wb.showView("perf")', "wb.measure()"] },
];

const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;
const [page, dir, prefix = ""] = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--only");
if (!page || !dir) { console.error("usage: shoot-views.mjs <page.html> <out-dir> [prefix] [--only name,name]"); process.exit(2); }
const url = pathToFileURL(resolve(page)).href;
let failed = 0;
for (const s of SHOTS.filter((s) => !only || only.includes(s.name))) {
  const out = resolve(dir, `${prefix}${s.name}.png`);
  try {
    await withPage({ url, size: s.size || "1600x1000", dark: !!s.dark, webgpu: !!s.webgpu }, async (p) => {
      await p.until("window.__kiln?.wb?.ready");
      for (const js of s.steps) await p.eval(`(async () => { const wb = window.__kiln.wb; await ${js}; })()`);
      await p.eval("(() => { const wb = window.__kiln.wb; wb.toasts = []; wb.bump('toast'); })()"); // toasts would cover the views
      await new Promise((r) => setTimeout(r, 900));
      await p.shot(out);
      console.log(`${s.name.padEnd(20)} ${p.errors.length ? "page errors: " + p.errors.join(" | ") : "ok"}`);
    });
  } catch (e) { failed++; console.log(`${s.name.padEnd(20)} FAILED ${e.message}`); }
}
process.exitCode = failed ? 1 : 0;
