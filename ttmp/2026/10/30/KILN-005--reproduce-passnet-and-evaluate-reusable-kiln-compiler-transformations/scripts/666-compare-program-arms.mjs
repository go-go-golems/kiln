#!/usr/bin/env node
// Compile each staged Kiln script untransformed and with a transformation program, exactly as
// kiln-export does (target a100, separate contraction), and report whether the exported kernels
// differ, the predicted cost of each arm and the choice a cost gate would make. Compile-only:
// it reads no measurement, so it is safe for selecting a held-out population.
//   node 666-compare-program-arms.mjs PROGRAM.json JOBS.json OUT.json     JOBS: [{id, script}]
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { params as paramSet } from "../../../../../../packages/kiln/src/core/kiln.js";
import { SPECS, target as mkTarget } from "../../../../../../packages/kiln/src/std/targets.js";
import { exportProgram } from "../../../../../../packages/kiln/src/std/export.js";
import { predictedCost } from "../../../../../../packages/kiln/src/std/tile.js";
import { compileScript } from "../../../../../../apps/workbench/src/compile.js";
import { prepareOptimizationProgram, applyOptimizationProgram } from "../../../../../../integrations/passnet/transformation_program.mjs";

const [programPath, jobsPath, outPath] = process.argv.slice(2);
const prepared = prepareOptimizationProgram(JSON.parse(readFileSync(programPath, "utf8")));
if (prepared.gate) throw new TypeError("pass the inner program; this script evaluates the gate itself");
const target = mkTarget(SPECS.a100);
const arm = (text, program) => {
  const c = compileScript(text, { params: paramSet([]), target, contraction: "separate",
    transformPipeline: program ? (pipe, { target: t }) => applyOptimizationProgram(pipe, t, program) : null });
  if (!c.ok || !c.prog) return { error: (c.diags || []).map((d) => d.message).join("; ").slice(0, 300) };
  const kernels = exportProgram(c.run, c.prog, { name: "arm", params: {}, target, source: {} }).kernels;
  return { us: predictedCost(c.run.at("tile"), target), kernels: kernels.length,
    sha256: createHash("sha256").update(JSON.stringify(kernels)).digest("hex") };
};
const out = [];
for (const job of JSON.parse(readFileSync(jobsPath, "utf8"))) {
  try {
    const text = readFileSync(job.script, "utf8"), base = arm(text, null), cand = arm(text, prepared);
    if (base.error || cand.error) { out.push({ id: job.id, error: base.error || cand.error }); continue; }
    out.push({ id: job.id, changed: base.sha256 !== cand.sha256, kernels: [base.kernels, cand.kernels],
      predicted_us: { baseline: base.us, transformed: cand.us }, gate: cand.us < base.us ? "transformed" : "baseline" });
  } catch (e) { out.push({ id: job.id, error: String(e.message).slice(0, 300) }); }
}
writeFileSync(outPath, JSON.stringify(out) + "\n");
console.log(out.length, "graphs;", out.filter((r) => r.changed).length, "changed;", out.filter((r) => r.error).length, "errors");
