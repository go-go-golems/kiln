#!/usr/bin/env node
// Example A's browser harness (guide §11): factory-videos' own similarity code, bundled from a checkout and timed in
// headless Chrome on real embedding vectors.
//
//   node similarity-bench.mjs baseline --fv DIR --vectors DIR [--out FILE]
//       A1: similarityMatrix (Float64, today's code) and the fillRect painter at n ∈ {400, 691, 1385, 2297}
//   node similarity-bench.mjs paired --fv DIR --vectors DIR [--out FILE] [--reps N] [--seed S]
//       A4: baseline vs the WebGPU path (similarityMatrixGpu: upload, kernel, read-back), seeded paired order,
//       plus the quality gate (max |Δ| and colour-step agreement against Float64) and the paint times
//   node similarity-bench.mjs gate --fv DIR --vectors DIR [--out FILE]
//       the quality gate alone, with the exact painted colour of every cell compared as well
//   node similarity-bench.mjs shot --fv DIR --vectors DIR --out PNG [--n N] [--d D] [--gpu]
//       a screenshot of the matrix painted from real vectors, as the view paints it
//
// --fv is a factory-videos checkout with node_modules installed; --vectors holds <model>-<n>x<d>.f32 files (raw
// little-endian fp32 rows, written from the embedding cache's matrix.npz).
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, extname } from "node:path";
import { withPage } from "/Volumes/SSD/code/kiln/scripts/shoot.mjs";
import { pairedRatio, summarize } from "/Volumes/SSD/code/kiln/packages/evidence/src/index.ts";

const esbuild = createRequire("/Volumes/SSD/code/kiln/apps/workbench/package.json")("esbuild");
const [mode, ...rest] = process.argv.slice(2);
const opt = (name, def) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : def; };
const flag = (name) => rest.includes(`--${name}`);
if (!["baseline", "paired", "gate", "shot"].includes(mode) || !opt("fv") || !opt("vectors")) {
  console.error(readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1, 16).map((l) => l.slice(3)).join("\n"));
  process.exit(2);
}
const FV = resolve(opt("fv")), VEC = resolve(opt("vectors"));
const SIM = join(FV, "web/live/views/similarity");
const gpuModule = join(SIM, "similarityGpu.ts");

// ---------------------------------------------------------------------------------------------------- the page
const work = mkdtempSync(join(tmpdir(), "kiln-simbench-"));
const entry = join(work, "entry.ts");
writeFileSync(entry, [
  `import { similarityMatrix, sequentialColour } from ${JSON.stringify(join(SIM, "model.ts"))};`,
  existsSync(gpuModule) && mode !== "baseline" ? `import * as gpu from ${JSON.stringify(gpuModule)};` : "const gpu = null;",
  existsSync(join(SIM, "paint.ts")) && mode !== "baseline" ? `import * as paint from ${JSON.stringify(join(SIM, "paint.ts"))};` : "const paint = null;",
  "(window as any).__sim = { similarityMatrix, sequentialColour, gpu, paint };",
].join("\n"));
await esbuild.build({ entryPoints: [entry], bundle: true, format: "esm", outfile: join(work, "bundle.js"), target: "es2022", logLevel: "warning", loader: { ".json": "json" } });
writeFileSync(join(work, "index.html"), `<!doctype html><meta charset="utf-8"><title>similarity bench</title>
<body style="margin:0;background:#fff"><canvas id="c"></canvas><script type="module" src="bundle.js"></script>`);

const files = new Map(readdirSync(VEC).filter((f) => f.endsWith(".f32")).map((f) => [f, join(VEC, f)]));
const server = createServer((req, res) => {
  const name = decodeURIComponent(req.url.slice(1).split("?")[0]) || "index.html";
  const path = files.get(name) || (["index.html", "bundle.js"].includes(name) ? join(work, name) : null);
  if (!path) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": { ".html": "text/html", ".js": "text/javascript" }[extname(path)] || "application/octet-stream" });
  res.end(readFileSync(path));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/index.html`;

// in-page helpers, as source: load vectors, make WindowVectors as windowVectors() does, paint as MatrixCanvas does
const HELPERS = `
  window.__vec = window.__vec || {};
  async function rows(file, n) {
    if (!window.__vec[file]) window.__vec[file] = new Float32Array(await (await fetch(file)).arrayBuffer());
    const all = window.__vec[file], d = +file.match(/x(\\d+)\\.f32$/)[1];
    return Array.from({ length: n }, (_, i) => {
      const v = all.subarray(i * d, (i + 1) * d), norm = Math.hypot(...v);
      return { scopeId: "w" + i, startMs: i * 2000, endMs: i * 2000 + 2000, unit: Float64Array.from(v, (x) => x / norm), norm, synthetic: false };
    });
  }
  // a copy of MatrixCanvas's effect (EmbeddingSimilarity.tsx:59-67), at one pixel per cell
  function paintFillRect(ctx, m) {
    const n = m.windows.length, { min, max, values } = m, span = min !== null && max !== null && max > min ? max - min : 1;
    ctx.clearRect(0, 0, n, n);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      ctx.fillStyle = i === j ? __sim.sequentialColour(1) : __sim.sequentialColour((values[i * n + j] - (min ?? 0)) / span);
      ctx.fillRect(j, i, 1, 1);
    }
    ctx.getImageData(0, 0, 1, 1);   // forces the queued drawing to finish inside the timed region
  }
  function canvasOf(n) { const c = document.getElementById("c"); c.width = n; c.height = n; return c.getContext("2d", { willReadFrequently: false }); }
  const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
`;

const SIZES = [400, 691, 1385, 2297];
const SETS = [{ file: "cosmos-embed1-2297x256.f32", d: 256 }, { file: "cosmos-embed1-2297x768.f32", d: 768 }];
const out = { mode, fv: FV, created: new Date().toISOString(), seed: +opt("seed", 1), userAgent: null, results: [] };

try {
  await withPage({ url, webgpu: true, size: "1400x1000", timeout: 3_600_000 }, async (p) => {
    await p.until("!!window.__sim", 30000);
    await p.eval(`(() => { ${HELPERS}; Object.assign(window, { rows, paintFillRect, canvasOf, median }); return true; })()`);
    out.userAgent = await p.eval("navigator.userAgent");
    if (mode === "baseline") {
      for (const { file, d } of SETS) for (const n of SIZES) {
        const reps = n <= 691 ? 7 : n <= 1385 ? 5 : 3;
        const r = await p.eval(`(async () => {
          const ws = await rows(${JSON.stringify(file)}, ${n});
          __sim.similarityMatrix(ws, ${n});                              // warm-up
          const build = [], paint = [];
          let m;
          for (let k = 0; k < ${reps}; k++) { const t0 = performance.now(); m = __sim.similarityMatrix(ws, ${n}); build.push(performance.now() - t0); }
          const ctx = canvasOf(${n});
          paintFillRect(ctx, m);                                         // warm-up
          for (let k = 0; k < ${Math.min(reps, 3)}; k++) { const t0 = performance.now(); paintFillRect(ctx, m); paint.push(performance.now() - t0); }
          return { build, paint, min: m.min, max: m.max };
        })()`);
        const b = summarize(r.build), pt = summarize(r.paint);
        out.results.push({ n, d, file, reps, build: r.build, paint: r.paint, buildMedianMs: b.median, buildCi: b.ci, paintMedianMs: pt.median, madds: (n * (n - 1) / 2) * d });
        console.log(`n=${String(n).padStart(4)} d=${d}: similarityMatrix median ${b.median.toFixed(1)} ms [${b.ci.map((x) => x.toFixed(1)).join(", ")}] (${reps} reps, ${((n * (n - 1) / 2) * d / (b.median * 1e6)).toFixed(2)} G mul-add/s); fillRect paint median ${pt.median.toFixed(1)} ms`);
      }
    }
    if (mode === "paired") await paired(p);
    if (mode === "gate") await paired(p, { gateOnly: true });
    if (mode === "shot") await shot(p);
  });
} finally {
  server.close();
  rmSync(work, { recursive: true, force: true });
}
if (opt("out") && mode !== "shot") { writeFileSync(opt("out"), JSON.stringify(out, null, 1) + "\n"); console.log(`→ ${opt("out")}`); }

// ------------------------------------------------------------------------------------------------------- paired
async function paired(p, { gateOnly = false } = {}) {
  const ok = await p.eval(`(async () => { try { return await __sim.gpu.gpuAvailable(); } catch (e) { return String(e); } })()`);
  if (ok !== true) throw new Error(`the page has no usable WebGPU: ${ok}`);
  const reps = +opt("reps", 9), seed = +opt("seed", 1);
  const sets = [...SETS, { file: "siglip2-siglip2-2297x768.f32", d: 768 }];
  for (const { file, d } of sets) for (const n of SIZES) {
    // quality gate first, on a warm pipeline: every cell of the n × n block against Float64
    const gate = await p.eval(`(async () => {
      const ws = await rows(${JSON.stringify(file)}, ${n});
      const ref = __sim.similarityMatrix(ws, ${n});
      const got = await __sim.gpu.similarityMatrixGpu(ws, ${n});
      const n = ${n}, STEPS = 256, span = (m) => (m.max > m.min ? m.max - m.min : 1);
      const step = (m, v) => Math.min(STEPS - 1, Math.floor(((v - m.min) / span(m)) * STEPS));
      // the painted colour, as paint.ts computes it from each matrix's own off-diagonal range
      const rgb = (m, v) => __sim.paint.sequentialRgb((v - m.min) / span(m)).join(",");
      let maxAbs = 0, same = 0, samePx = 0, cells = 0;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const a = ref.values[i * n + j], b = got.values[i * n + j];
        maxAbs = Math.max(maxAbs, Math.abs(a - b)); cells++;
        if (step(ref, a) === step(got, b)) same++;
        if (rgb(ref, a) === rgb(got, b)) samePx++;
      }
      return { maxAbs, sameStep: same / cells, samePixel: samePx / cells, cells, refMin: ref.min, refMax: ref.max, gpuMin: got.min, gpuMax: got.max, bucket: got.bucket, identity: got.identity, diagonal: got.values[0] };
    })()`);
    if (gateOnly) {
      out.results.push({ n, d, file, gate });
      console.log(`n=${String(n).padStart(4)} d=${d} ${file.split("-")[0].padEnd(7)}: bucket ${gate.bucket}, max|Δ| ${gate.maxAbs.toExponential(2)}, same step ${(gate.sameStep * 100).toFixed(3)} %, same painted colour ${(gate.samePixel * 100).toFixed(3)} % of ${gate.cells} cells; range CPU [${gate.refMin.toFixed(5)}, ${gate.refMax.toFixed(5)}] GPU [${gate.gpuMin.toFixed(5)}, ${gate.gpuMax.toFixed(5)}]`);
      continue;
    }
    // paired timing: per repetition one baseline and one GPU run, order from a seeded coin
    const r = await p.eval(`(async () => {
      const ws = await rows(${JSON.stringify(file)}, ${n});
      let s = ${seed} * 2654435761 >>> 0;
      const coin = () => { s = (s * 1664525 + 1013904223) >>> 0; return s & 0x10000; };
      const reps = ${n >= 2297 ? Math.min(reps, 5) : reps}, pairs = [];
      __sim.similarityMatrix(ws, ${n}); await __sim.gpu.similarityMatrixGpu(ws, ${n});   // warm both
      for (let k = 0; k < reps; k++) {
        const t = {};
        const runA = () => { const t0 = performance.now(); __sim.similarityMatrix(ws, ${n}); t.a = performance.now() - t0; };
        const runB = async () => { const t0 = performance.now(); await __sim.gpu.similarityMatrixGpu(ws, ${n}); t.b = performance.now() - t0; };
        const bFirst = !!coin();
        if (bFirst) { await runB(); runA(); } else { runA(); await runB(); }
        pairs.push({ rep: k, a: t.a, b: t.b, order: bFirst ? "ba" : "ab" });
      }
      // paint: today's fillRect loop vs the ImageData painter, on the GPU result
      const m = await __sim.gpu.similarityMatrixGpu(ws, ${n});
      const ctx = canvasOf(${n});
      const paintRect = [], paintImage = [];
      if (${n} <= 1385) { paintFillRect(ctx, m); for (let k = 0; k < 3; k++) { const t0 = performance.now(); paintFillRect(ctx, m); paintRect.push(performance.now() - t0); } }
      __sim.paint.paintMatrix(ctx, m, 1);
      for (let k = 0; k < 5; k++) { const t0 = performance.now(); __sim.paint.paintMatrix(ctx, m, 1); ctx.getImageData(0, 0, 1, 1); paintImage.push(performance.now() - t0); }
      // end to end for the cap-lift hypothesis: GPU matrix and ImageData paint, as the view does them
      const e2e = [];
      for (let k = 0; k < 5; k++) { const t0 = performance.now(); const mm = await __sim.gpu.similarityMatrixGpu(ws, ${n}); __sim.paint.paintMatrix(ctx, mm, 1); ctx.getImageData(0, 0, 1, 1); e2e.push(performance.now() - t0); }
      return { pairs, paintRect, paintImage, e2e };
    })()`);
    const ratio = pairedRatio(r.pairs.map(({ rep, a, b }) => ({ rep, a, b })), { seed });
    const a = summarize(r.pairs.map((x) => x.a)), b = summarize(r.pairs.map((x) => x.b)), e2e = summarize(r.e2e);
    const pi = summarize(r.paintImage), pr = r.paintRect.length ? summarize(r.paintRect) : null;
    out.results.push({ n, d, file, gate, pairs: r.pairs, ratio, baselineMedianMs: a.median, gpuMedianMs: b.median, paintRectMs: r.paintRect, paintImageMs: r.paintImage, e2eMs: r.e2e, e2eMedianMs: e2e.median });
    console.log(`n=${String(n).padStart(4)} d=${d} ${file.split("-")[0].padEnd(7)}: CPU ${a.median.toFixed(1)} ms, GPU ${b.median.toFixed(2)} ms, ratio GPU/CPU ${ratio.median.toFixed(4)} [${ratio.ci.map((x) => x.toFixed(4)).join(", ")}] (${ratio.n} pairs); `
      + `gate max|Δ| ${gate.maxAbs.toExponential(2)}, same step ${(gate.sameStep * 100).toFixed(3)} %; paint fillRect ${pr ? pr.median.toFixed(1) + " ms" : "—"}, ImageData ${pi.median.toFixed(1)} ms; GPU+paint ${e2e.median.toFixed(1)} ms`);
  }
}

// --------------------------------------------------------------------------------------------------------- shot
async function shot(p) {
  const n = +opt("n", 1385), d = +opt("d", 768), file = SETS.find((s) => s.d === d).file;
  const size = await p.eval(`(async () => {
    const ws = await rows(${JSON.stringify(file)}, ${n});
    const m = ${flag("gpu") ? `await __sim.gpu.similarityMatrixGpu(ws, ${n})` : `__sim.similarityMatrix(ws, ${n})`};
    const ctx = canvasOf(${n});
    ${flag("gpu") ? `__sim.paint.paintMatrix(ctx, m, 1)` : `paintFillRect(ctx, m)`};
    return ${n};
  })()`);
  await p.send("Emulation.setDeviceMetricsOverride", { width: size, height: size, deviceScaleFactor: 1, mobile: false });
  await p.shot(opt("out"));
  console.log(`→ ${opt("out")} (${size}×${size})`);
}
