#!/usr/bin/env node
// kiln-paired/1: one paired comparison of a consumer's code (arm a) with a Kiln-backed replacement (arm b), with the
// consumer revision, the host, each Kiln kernel's identity and codegen, the per-repetition samples and the paired
// ratio. Perf Lab's importer (PE) reads these; this script writes them from a harness's output.
//
//   node kiln-paired.mjs similarity <paired.json> --program-set FILE --fv-rev REV --adapter TEXT --out-dir DIR
//       Example A: one record per (vectors, n, d) row of similarity-bench.mjs paired output, and verdicts for the
//       hypotheses gpu-rebuild-1385 and cap-lift-interactive (guide §11)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { summarize } from "/Volumes/SSD/code/kiln/packages/evidence/src/index.ts";

const [kind, input, ...rest] = process.argv.slice(2);
const opt = (name) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : null; };
if (kind !== "similarity" || !input || !opt("program-set") || !opt("out-dir")) {
  console.error(readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1, 9).map((l) => l.slice(3)).join("\n"));
  process.exit(2);
}

const run = JSON.parse(readFileSync(input, "utf8"));
const set = JSON.parse(readFileSync(opt("program-set"), "utf8")).programs;
const outDir = opt("out-dir");
mkdirSync(outDir, { recursive: true });
const host = { kind: "browser", userAgent: run.userAgent, adapter: opt("adapter"), harness: "KILN-002 scripts/similarity-bench.mjs paired" };
const records = [];
for (const r of run.results) {
  const program = set.find((p) => p.params.windows === r.gate.bucket && p.params.dims === r.d);
  const k = program.kernels[0];
  if (k.identity !== r.gate.identity) throw new Error(`identity mismatch at n=${r.n} d=${r.d}: ${k.identity} vs ${r.gate.identity}`);
  const rec = {
    format: "kiln-paired/1",
    example: "A",
    question: `similarity matrix of ${r.n} windows × ${r.d} dims: CPU Float64 vs Kiln W-26 on WebGPU`,
    consumer: { repo: "factory-videos", revision: opt("fv-rev"), path: "web/live/views/similarity" },
    host,
    workload: { windows: r.n, dims: r.d, vectors: `${r.file} (first ${r.n} rows, unit length)` },
    arms: {
      a: { name: "similarityMatrix", lang: "TypeScript (Float64)", source: "model.ts" },
      b: {
        name: "similarityMatrixGpu", lang: "WGSL via kiln-program/1", source: "similarityGpu.ts + kiln/window-similarity.json",
        kernels: [{ name: k.name, identity: k.identity, codegen: program.codegen, row: k.row, bucket: r.gate.bucket, preset: program.source?.path, presetSha256: program.source?.sha256 }],
      },
    },
    protocol: { unit: "ms", timer: "performance.now()", order: "seeded coin per repetition", seed: run.seed ?? null, warmup: "one run of each arm", includes: "b: input packing, upload, kernel, read-back, block extraction, min/max" },
    samples: r.pairs,
    ratio: r.ratio,
    medians: { a: r.baselineMedianMs, b: r.gpuMedianMs },
    gate: r.gate,
    paint: { fillRectMs: r.paintRectMs, imageDataMs: r.paintImageMs, gpuPlusPaintMs: r.e2eMs },
  };
  const name = `A-${r.file.split("-")[0]}-${r.n}x${r.d}.json`;
  writeFileSync(join(outDir, name), JSON.stringify(rec, null, 1) + "\n");
  records.push(rec);
}

// verdicts (guide §11)
const at = (n, d) => records.filter((x) => x.workload.windows === n && x.workload.dims === d);
const h1 = at(1385, 768).map((x) => ({ vectors: x.workload.vectors.split(" ")[0], ratio: x.ratio.median, ci: x.ratio.ci, supported: x.ratio.ci[1] < 0.1 }));
const h2 = at(2297, 768).map((x) => { const s = summarize(x.paint.gpuPlusPaintMs); return { vectors: x.workload.vectors.split(" ")[0], samples: x.paint.gpuPlusPaintMs, median: s.median, ci: s.ci, supported: x.paint.gpuPlusPaintMs.every((v) => v < 100) }; });
const gate = records.map((x) => ({ n: x.workload.windows, d: x.workload.dims, vectors: x.workload.vectors.split(" ")[0], maxAbs: x.gate.maxAbs, sameStep: x.gate.sameStep, ok: x.gate.maxAbs <= 1e-5 && x.gate.sameStep >= 0.999 }));
const verdicts = {
  "gpu-rebuild-1385": { statement: "at n = 1,385, d = 768, the GPU path's median time is below 0.1 × the CPU's", rule: "upper end of the paired ratio's 95 % interval < 0.1", rows: h1, verdict: h1.every((x) => x.supported) ? "supported" : "refuted" },
  "cap-lift-interactive": { statement: "at n = 2,297, d = 768, GPU compute + read-back + paint completes in under 100 ms", rule: "every sample < 100 ms", rows: h2, verdict: h2.every((x) => x.supported) ? "supported" : "refuted" },
  "quality-gate": { statement: "max |s_gpu − s_f64| ≤ 1e-5 and ≥ 99.9 % of cells in the same colour step", rows: gate, verdict: gate.every((x) => x.ok) ? "pass" : "fail" },
};
writeFileSync(join(outDir, "verdicts.json"), JSON.stringify(verdicts, null, 1) + "\n");
for (const [k, v] of Object.entries(verdicts)) console.log(`${k}: ${v.verdict}`);
console.log(`${records.length} records → ${outDir}`);
