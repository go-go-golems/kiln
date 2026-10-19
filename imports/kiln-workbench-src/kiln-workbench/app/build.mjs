// Builds Kiln Workbench into one artifact page: generated modules (presets, docs, the CUDA runner's
// source), then an esbuild bundle (React comes from cdnjs as UMD globals), inlined with the CSS.
//   node build.mjs           → dist/index.html (the artifact page, no doctype: the host wraps it)
//                              dist/kiln-workbench.html (standalone, for kiln_runner.py serve)
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
const files = readdirSync(here("../presets/")).filter((f) => f.endsWith(".js")).sort();
// a preset is W-NN-name.js, with optional notes (a Markdown tutorial) in W-NN-name.md beside it
const presets = files.map((f) => {
  const text = readFileSync(here("../presets/" + f), "utf8");
  const mdPath = here("../presets/" + f.replace(/\.js$/, ".md"));
  let notes = "";
  try { notes = readFileSync(mdPath, "utf8"); } catch {}
  return { ...parseHeader(text), text, notes };
});
writeFileSync(here("src/presets.gen.js"), "export const PRESETS = " + JSON.stringify(presets) + ";\n");
writeFileSync(here("src/docs.gen.js"), `export const REFERENCE = ${JSON.stringify(read("../reference.txt"))};\nexport const GUIDELINES = ${JSON.stringify(read("../agent-guidelines.txt"))};\nexport const RUNNER = ${JSON.stringify(read("../runner/kiln_runner.py"))};\n`);
if (process.argv.includes("--gen-only")) process.exit(0);

// ---------- bundle ----------
const globals = {
  name: "umd-globals",
  setup(b) {
    b.onResolve({ filter: /^react(-dom)?(\/client)?$/ }, (a) => ({ path: a.path, namespace: "umd" }));
    b.onLoad({ filter: /.*/, namespace: "umd" }, (a) => ({ contents: `module.exports = ${a.path.startsWith("react-dom") ? "window.ReactDOM" : "window.React"};`, loader: "js" }));
  },
};
const out = await esbuild.build({
  entryPoints: [here("src/main.jsx").pathname], bundle: true, format: "iife", write: false, minify: !dev, keepNames: true, target: "es2022",
  jsx: "transform", define: { "process.env.NODE_ENV": '"production"' }, plugins: [globals], legalComments: "none", logLevel: "warning",
});
const js = out.outputFiles[0].text;

// ---------- page ----------
const css = read("src/ui/forge-base.css").replace(/^\s*<style>\s*/, "").replace(/\s*<\/style>\s*$/, "") + "\n" + read("src/ui/lab.css") + "\n" + read("src/ui/kiln.css");
const esc = (s) => s.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");
const body = `<title>Kiln Workbench</title>
<meta name="description" content="A compiler workbench: write programs, passes and IRs in JavaScript, watch every rewrite, generate CUDA and WGSL, and measure kernels on simulated GPUs, WebGPU or a CUDA box, with a coding agent.">
<style>
${css}
</style>
<div id="root"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js"></script>
<script>
${esc(js)}
</script>
`;
mkdirSync(here("dist"), { recursive: true });
writeFileSync(here("dist/index.html"), body);
writeFileSync(here("dist/kiln-workbench.html"), `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n</head><body>\n${body}</body></html>\n`);
const kb = (n) => (n / 1024).toFixed(0) + " KB";
console.log(`dist/index.html ${kb(Buffer.byteLength(body))} (bundle ${kb(js.length)}, ${presets.length} presets, ${presets.filter((p) => p.notes).length} with notes)`);
