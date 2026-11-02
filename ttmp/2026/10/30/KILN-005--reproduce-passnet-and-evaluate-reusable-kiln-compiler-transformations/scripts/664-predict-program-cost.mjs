#!/usr/bin/env node
// For each Kiln script in a job list, compile with the standard pipeline exactly as the uniform
// qualification did (target a100, separate contraction) and score the chosen schedules with the
// analytic cost model under both the a100 model (what chose them) and the measured gb10 spec
// (the hardware that ran them), plus the Loop IR work estimate the fusion policies see.
//   node 664-predict-program-cost.mjs JOBS.json OUT.json      JOBS: [{id, script, program?}]
// A job's optional program is a kiln-transformation-program/1 path applied as kiln-export does.
import { readFileSync, writeFileSync } from "node:fs";
import { params as paramSet } from "../../../../../../packages/kiln/src/core/kiln.js";
import { SPECS, target as mkTarget } from "../../../../../../packages/kiln/src/std/targets.js";
import { analyze, estimate } from "../../../../../../packages/kiln/src/std/tile.js";
import { workOf, schedule } from "../../../../../../packages/kiln/src/std/loop.js";
import { compileScript } from "../../../../../../apps/workbench/src/compile.js";
import { prepareOptimizationProgram, applyOptimizationProgram } from "../../../../../../integrations/passnet/transformation_program.mjs";
const prepared = new Map();
const transformFor = (path) => {
  if (!path) return null;
  if (!prepared.has(path)) prepared.set(path, prepareOptimizationProgram(JSON.parse(readFileSync(path, "utf8"))));
  const program = prepared.get(path);
  return (pipe, { target: t }) => applyOptimizationProgram(pipe, t, program);
};

const [jobsPath, outPath] = process.argv.slice(2);
const target = mkTarget(SPECS.a100), gb10 = mkTarget(SPECS.gb10);
const out = [];
for (const job of JSON.parse(readFileSync(jobsPath, "utf8"))) {
  try {
    const c = compileScript(readFileSync(job.script, "utf8"), { params: paramSet([]), target, contraction: "separate", transformPipeline: transformFor(job.program) });
    if (!c.ok) { out.push({ id: job.id, error: c.diags.map((d) => d.message).join("; ").slice(0, 300) }); continue; }
    const kernels = [];
    for (const n of c.run.at("tile").nodes.values()) {
      if (n.name !== "tile.kernel") continue;
      const an = analyze(n.attrs.expr, n.attrs.shape, n.attrs.inShapes);
      const e = estimate(an, n.attrs.map, target), g = estimate(an, n.attrs.map, gb10);
      kernels.push({ us: e.us, gb10_us: g.us, bound: e.bound, work: workOf(schedule(n.attrs.expr, n.attrs.shape)), map: n.attrs.map?.MAP ?? "thread" });
    }
    out.push({ id: job.id, kernels: kernels.length, predicted_us: kernels.reduce((a, k) => a + k.us, 0),
      predicted_gb10_us: kernels.reduce((a, k) => a + k.gb10_us, 0),
      launch_bound: kernels.filter((k) => k.bound === "launch").length,
      work: kernels.reduce((a, k) => a + k.work, 0), maps: kernels.map((k) => k.map) });
  } catch (e) { out.push({ id: job.id, error: String(e.message).slice(0, 300) }); }
}
writeFileSync(outPath, JSON.stringify(out) + "\n");
console.log(out.length, "predictions;", out.filter((r) => r.error).length, "errors");
