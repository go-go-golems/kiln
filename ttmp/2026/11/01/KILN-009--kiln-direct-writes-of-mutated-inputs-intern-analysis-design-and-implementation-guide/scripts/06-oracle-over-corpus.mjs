#!/usr/bin/env node
// Phase 3 oracle over the compiled input-mutation corpus (KILN-009): for every graph of the given task directories
// (written by 05-mutation-plan-table.py), compile the Kiln script in process with the replay settings (a100,
// contraction separate, FP32 products), export it twice (mutation strategy auto and writeback), run both exported
// programs on the CPU program oracle (packages/kiln/src/std/program-sim.js) with the project's own inputs, and require
//   - no aliasing hazard in the auto arm (instrumented: cross-thread read of a stored element, read after store), and
//   - every output and every final input buffer bitwise equal between the arms (same kernels, same simulator: the
//     only difference is where the mutated value is written).
// Programs whose launches exceed --budget simulated threads are skipped and counted.
// usage: node 06-oracle-over-corpus.mjs --output report.json [--budget N] TASK_DIR...
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../..");
const { params: paramSet } = await import(join(ROOT, "packages/kiln/src/core/kiln.js"));
const { SPECS, target: mkTarget } = await import(join(ROOT, "packages/kiln/src/std/targets.js"));
const { exportProgram } = await import(join(ROOT, "packages/kiln/src/std/export.js"));
const { simulateProgram } = await import(join(ROOT, "packages/kiln/src/std/program-sim.js"));
const { compileScript } = await import(join(ROOT, "apps/workbench/src/compile.js"));

const args = process.argv.slice(2);
let output = null, budget = 2 ** 24;
const dirs = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--output") output = args[++i];
  else if (args[i] === "--budget") budget = Number(args[++i]);
  else dirs.push(args[i]);
}
if (!output || !dirs.length) { console.error("usage: 06-oracle-over-corpus.mjs --output report.json [--budget N] TASK_DIR..."); process.exit(2); }
const target = mkTarget(SPECS.a100);
const same = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]) || (Number.isNaN(v) && Number.isNaN(b[i])));
const rows = [];
for (const dir of dirs) {
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  for (const v of manifest.variants) {
    if (!v.input_mutations.length) continue;
    const names = Object.keys(v.inputs);
    const mutations = Object.fromEntries(v.input_mutations.map((m) => [m.output, names[m.input_index]]));
    const row = { task: dir.split("/").pop(), script: v.script };
    rows.push(row);
    try {
      const c = compileScript(readFileSync(join(dir, v.script), "utf8"), { params: paramSet([]), target, pins: {}, contraction: "separate", matmulPrecision: "highest" });
      if (!c.ok) { row.status = "compile-failed"; continue; }
      const auto = exportProgram(c.run, c.prog, { mutations }), wb = exportProgram(c.run, c.prog, { mutations, mutationStrategy: "writeback" });
      row.strategies = auto.mutations.map((m) => m.strategy);
      row.kernels = [auto.kernels.length, wb.kernels.length];
      const threads = Math.max(...[auto, wb].map((p) => p.kernels.reduce((s, kn) => s + kn.grid * kn.block, 0)));
      if (threads > budget) { row.status = `skipped: ${threads} simulated threads`; continue; }
      const feed = Object.fromEntries(Object.entries(c.project.inputsFor(c.graph)).map(([n, t]) => [n, Float32Array.from(t.data, Number)]));
      const t0 = performance.now();
      const a = simulateProgram(auto, feed, { instrument: true }), b = simulateProgram(wb, feed);
      row.ms = Math.round(performance.now() - t0);
      const diffs = [...Object.keys(a.outputs).filter((n) => !same(a.outputs[n], b.outputs[n])).map((n) => `output ${n}`),
        ...Object.keys(a.inputs).filter((n) => !same(a.inputs[n], b.inputs[n])).map((n) => `input ${n}`)];
      row.hazards = a.hazards.slice(0, 3);
      row.status = a.hazards.length ? "HAZARD" : diffs.length ? `DIFFERS: ${diffs.join(", ")}` : "ok";
    } catch (e) { row.status = `error: ${e.message.slice(0, 200)}`; }
    finally { console.log(row.task, row.script, row.strategies?.join(",") ?? "", row.status, row.ms ?? ""); }
  }
}
const count = (f) => rows.filter(f).length;
const summary = { programs: rows.length, ok: count((r) => r.status === "ok"), hazard: count((r) => r.status === "HAZARD"), differs: count((r) => r.status?.startsWith("DIFFERS")), skipped: count((r) => r.status?.startsWith("skipped")), errors: count((r) => r.status?.startsWith("error") || r.status === "compile-failed") };
writeFileSync(output, JSON.stringify({ format: "kiln-mutation-oracle/1", budget, summary, rows }, null, 1) + "\n");
console.log(JSON.stringify(summary));
