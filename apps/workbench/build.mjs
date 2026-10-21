// Builds Kiln Workbench into one artifact page: generated modules (presets, docs), then an esbuild bundle (React, ReactDOM and KaTeX from npm, so the page works offline),
// inlined with the CSS.
//   node build.mjs           → dist/index.html (the artifact page, no doctype: the host wraps it)
//                              dist/kiln-workbench.html (standalone, the page the Kiln server serves)
//   node build.mjs --gen-only → only the generated modules: src/presets.gen.js, src/labs.gen.js, src/docs.gen.js and
//                              src/frame.gen.js (the Node tests need them)
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import * as esbuild from "esbuild";

const here = (p) => new URL(p, import.meta.url);
const read = (p) => readFileSync(here(p), "utf8");
const dev = process.argv.includes("--dev");

// ---------- generated modules ----------
function parseHeader(text) {
  const head = text.match(/\/\*\*\s*([A-Z]-\d+)?\s*([^\n]*)\n([\s\S]*?)\*\//);
  const field = (k) => ((head?.[3] || "").match(new RegExp("\\*\\s+" + k + "\\s+(.+)")) || [])[1]?.trim() || "";
  return { id: head?.[1] || null, title: (head?.[2] || "Untitled").trim(), group: field("group") || "Mine", about: field("about"), tries: field("try").split("|").map((s) => s.trim()).filter(Boolean) };
}
const files = readdirSync(here("presets/")).filter((f) => f.endsWith(".js")).sort();
// a preset is W-NN-name.js, with optional notes (a Markdown tutorial) in W-NN-name.md beside it
const presets = files.map((f) => {
  const text = readFileSync(here("presets/" + f), "utf8");
  const mdPath = here("presets/" + f.replace(/\.js$/, ".md"));
  let notes = "";
  try { notes = readFileSync(mdPath, "utf8"); } catch {}
  return { ...parseHeader(text), text, notes };
});
writeFileSync(here("src/presets.gen.js"), "export const PRESETS = " + JSON.stringify(presets) + ";\n");
// lab programs (guide §33): Perf Lab's presets as @kiln/lab ships them, with the picker's names from Perf Lab's index
const LAB_META = {
  hello: ["Hello, Perf Lab", "Basics", "The smallest program: one experiment, one derive, one board."],
  parameters: ["Parameters", "Parameters", "Every parameter kind, and the three bindings: VIEW re-renders, DATA recomputes, PLAN becomes a pending plan."],
  "request-to-kernel": ["Request to kernel", "Evidence", "A run picker, a timeline and a route from one request to its kernel, its source and its operation."],
  compare: ["Compare runs", "Evidence", "Manifest diff, a paired estimate over processes, and a mirror of two traces."],
  learn: ["Learn the math", "Learning", "Walkthroughs of bilinear sampling, the fused reduction, RMSNorm and tiling."],
  matrices: ["Matrices and plans", "Plans", "matrix() and when() expand an ablation and an interference study."],
  "scenario-a": ["Scenario A · sampled intermediate", "Scenarios", "Logical traffic, measured traffic and retained allocation for the DINO fusion."],
  "scenario-b": ["Scenario B · layout churn", "Scenarios", "Embedding graph-cache captures and evictions under an open-loop offer."],
  "scenario-c": ["Scenario C · incomplete evidence", "Scenarios", "A lost trace interval and missing symbols: what still holds."],
  "local-sampler": ["Local · measured sampler", "Measured", "Real runs: eager grid_sample against TorchInductor, timing, trace, allocator and CPU evidence."],
  "dino-pr1005": ["PR 1005 · Grounding DINO on the DGX", "Measured", "The PR's DGX qualification evidence: paired latency, memory pools, stages, kernels, detections."],
};
const labDir = new URL("../../packages/lab/presets/", import.meta.url);
const labs = readdirSync(labDir).filter((f) => f.endsWith(".lab.js")).sort().map((f) => {
  const id = f.replace(/\.lab\.js$/, ""), [name, group, description] = LAB_META[id] ?? [id, "Other", ""];
  return { id, name, group, description, source: readFileSync(new URL(f, labDir), "utf8") };
});
writeFileSync(here("src/labs.gen.js"), "export const LAB_PROGRAMS = " + JSON.stringify(labs) + ";\n");
writeFileSync(here("src/docs.gen.js"), `export const REFERENCE = ${JSON.stringify(read("reference.txt"))};\nexport const GUIDELINES = ${JSON.stringify(read("agent-guidelines.txt"))};\n`);
// the agent's eval worker (src/agent/worker-main.js) is its own bundle, embedded as text in the page (guide §31)
const frame = await esbuild.build({ entryPoints: [here("src/agent/worker-main.js").pathname], bundle: true, format: "iife", write: false, minify: !dev, keepNames: true, target: "es2022", legalComments: "none", logLevel: "warning" });
writeFileSync(here("src/frame.gen.js"), `export const WORKER_JS = ${JSON.stringify(frame.outputFiles[0].text)};\n`);
if (process.argv.includes("--gen-only")) process.exit(0);

// ---------- bundle ----------
const out = await esbuild.build({
  entryPoints: [here("src/main.jsx").pathname], bundle: true, format: "iife", write: false, minify: !dev, keepNames: true, target: "es2022",
  jsx: "transform", define: { "process.env.NODE_ENV": '"production"' }, legalComments: "none", logLevel: "warning",
});
const js = out.outputFiles[0].text;

// ---------- page ----------
// tokens first; each later sheet only uses them; utilities last so they override
const css = ["tokens", "base", "chrome", "views", "evidence", "jobs", "lab/lab", "utilities"].map((f) => read(`src/ui/${f}.css`)).join("\n");
const esc = (s) => s.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");
const body = `<title>Kiln Workbench</title>
<meta name="description" content="A compiler workbench: write programs, passes and IRs in JavaScript, watch every rewrite, generate CUDA and WGSL, and measure kernels on simulated GPUs, WebGPU or a CUDA box, with a coding agent.">
<style>
${css}
</style>
<div id="root"></div>
<script>
${esc(js)}
</script>
`;
mkdirSync(here("dist"), { recursive: true });
writeFileSync(here("dist/index.html"), body);
writeFileSync(here("dist/kiln-workbench.html"), `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n</head><body>\n${body}</body></html>\n`);
const kb = (n) => (n / 1024).toFixed(0) + " KB";
console.log(`dist/index.html ${kb(Buffer.byteLength(body))} (bundle ${kb(js.length)}, ${presets.length} presets, ${presets.filter((p) => p.notes).length} with notes)`);
