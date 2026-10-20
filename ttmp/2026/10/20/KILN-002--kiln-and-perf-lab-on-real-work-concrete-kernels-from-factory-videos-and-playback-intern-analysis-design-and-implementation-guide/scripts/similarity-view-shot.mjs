#!/usr/bin/env node
// Mounts factory-videos' EmbeddingSimilarity view in headless Chrome on a run of real window vectors and takes a
// screenshot, with WebGPU on (the GPU matrix) or off (the CPU fallback). Prints what the view reports: the engine
// that computed the matrix, how many windows it shows, and the "older not shown" badge if any.
//
//   node similarity-view-shot.mjs --fv DIR --vectors DIR --out PNG [--n 1385] [--d 768] [--no-webgpu] [--size 1400x1100]
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, extname } from "node:path";
import { withPage } from "/Volumes/SSD/code/kiln/scripts/shoot.mjs";

const esbuild = createRequire("/Volumes/SSD/code/kiln/apps/workbench/package.json")("esbuild");
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const FV = resolve(opt("fv")), VEC = resolve(opt("vectors")), n = +opt("n", 1385), d = +opt("d", 768);
const webgpu = !args.includes("--no-webgpu");
const file = d === 256 ? "cosmos-embed1-2297x256.f32" : "cosmos-embed1-2297x768.f32";
const live = join(FV, "web/live");
const work = mkdtempSync(join(tmpdir(), "kiln-simview-"));

writeFileSync(join(work, "entry.tsx"), `
import '@playback-ui/core/tokens.css';
import '@playback-ui/core/styles.css';
import '@playback-ui/timeline/styles.css';
import ${JSON.stringify(join(live, "live.css"))};
import { createRoot } from 'react-dom/client';
import { EmbeddingSimilarity } from ${JSON.stringify(join(live, "views/similarity/EmbeddingSimilarity.tsx"))};
import { filledStore, fixedTime, viewContext, ViewHarness } from ${JSON.stringify(join(live, "testing/views.tsx"))};

const all = new Float32Array(await (await fetch(${JSON.stringify(file)})).arrayBuffer());
const n = ${n}, d = ${d}, W = 2000;
// the envelope shape of the committed cosmos fixture (fixtures/results/cosmos/vectors.jsonl), one per window
const runId = 'run-kiln-002-similarity';
const vectors = Array.from({ length: n }, (_, i) => ({
  schema: 'factory.result/1', runId, sourceId: 'kiln-002', output: 'vectors', timeDomain: 'source-relative',
  producedAt: '2026-10-20T00:00:00.000+00:00', status: 'complete', reason: null,
  sequence: i + 1,
  scope: { kind: 'window', id: 'w' + i, startMs: i * W, endMs: i * W + W },
  values: { kind: 'Embeddings', vector: Array.from(all.subarray(i * d, (i + 1) * d)), synthetic: false, model: 'nvidia/Cosmos-Embed1-448p' },
}));
const store = filledStore(runId, { vectors: vectors as any });
const t = Math.round(n * 0.62) * W + 500;
const time = { ...fixedTime(t, n * W), viewport: { startMs: 0, endMs: n * W } };
createRoot(document.getElementById('root')!).render(
  <ViewHarness time={time}>
    <div style={{ padding: 16, maxWidth: 1360 }}>
      <EmbeddingSimilarity ctx={viewContext(store)} binding={{ vectors: 'vectors' }} props={{}} setProps={() => {}} />
    </div>
  </ViewHarness>,
);
(window as any).__mounted = true;
`);
await esbuild.build({
  entryPoints: [join(work, "entry.tsx")], bundle: true, format: "esm", outdir: work, target: "es2022", jsx: "automatic",
  nodePaths: [join(FV, "web/node_modules")], loader: { ".json": "json", ".woff": "dataurl", ".woff2": "dataurl", ".svg": "dataurl", ".png": "dataurl" },
  define: { "import.meta.env.MODE": '"production"', "import.meta.env.DEV": "false" }, logLevel: "error",
});
writeFileSync(join(work, "index.html"), `<!doctype html><meta charset="utf-8"><title>similarity view</title>
<link rel="stylesheet" href="entry.css"><body style="margin:0;background:var(--pui-surface, #fff)"><div id="root"></div><script type="module" src="entry.js"></script>`);
const server = createServer((req, res) => {
  const name = decodeURIComponent(req.url.slice(1).split("?")[0]) || "index.html";
  const path = name === file ? join(VEC, file) : ["index.html", "entry.js", "entry.css"].includes(name) ? join(work, name) : null;
  if (!path) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }[extname(path)] || "application/octet-stream" });
  res.end(readFileSync(path));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
try {
  await withPage({ url: `http://127.0.0.1:${server.address().port}/index.html`, webgpu, size: opt("size", "1400x1100"), timeout: 300000 }, async (p) => {
    await p.until(`!!document.querySelector('[data-part="similarity-matrix"]')`, 120000);
    // the GPU result replaces the CPU one when it resolves; give it a moment, then report what is shown
    if (webgpu) await p.until(`document.querySelector('[data-part="similarity-matrix"]').dataset.engine === 'webgpu'`, 60000).catch(() => {});
    await new Promise((r) => setTimeout(r, 800));
    const state = await p.eval(`(() => { const f = document.querySelector('[data-part="similarity-matrix"]'); const c = f.querySelector('canvas');
      return { engine: f.dataset.engine, n: +f.dataset.n, canvas: c.width + 'x' + c.height, shown: Math.round(c.getBoundingClientRect().width) + 'px',
               badge: [...f.querySelectorAll('figcaption *')].map((e) => e.textContent).find((t) => /older not shown/.test(t)) || null, gpu: !!navigator.gpu }; })()`);
    console.log(JSON.stringify(state));
    await p.shot(opt("out"));
    console.log(`→ ${opt("out")}`);
  });
} finally {
  server.close();
  rmSync(work, { recursive: true, force: true });
}
