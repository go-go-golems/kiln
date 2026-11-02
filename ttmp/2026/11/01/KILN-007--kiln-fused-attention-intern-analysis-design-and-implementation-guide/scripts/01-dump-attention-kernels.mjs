// KILN-007 experiment: compile the composed SDPA lowering (fx_compose.lower_sdpa shape) on CPU and print
// every kernel at the loop and tile levels, with the analytic model's predicted time on gb10.
// Usage (from the worktree root): node ttmp/2026/11/01/KILN-007--*/scripts/01-dump-attention-kernels.mjs [B H L S D]
import { SPECS, target } from "../../../../../../packages/kiln/src/std/targets.js";
import { compileScript } from "../../../../../../apps/workbench/src/compile.js";
import { params as paramSet } from "../../../../../../packages/kiln/src/core/kiln.js";
import { estimate, analyze, predictedCost } from "../../../../../../packages/kiln/src/std/tile.js";
import { schedule, printNest } from "../../../../../../packages/kiln/src/std/loop.js";
const [B, H, L, S, D] = (process.argv.slice(2).length ? process.argv.slice(2) : ["2", "12", "128", "128", "64"]).map(Number);
const scale = 1 / Math.sqrt(D);
const script = `project("sdpa").program(({ q, kk, v, mask }) => {
  const s = N.add(N.mul(N.matmul(q, N.transpose(kk, -2, -1), "highest"), ${scale}), mask);
  return { out: N.matmul(N.softmax(s, -1), v, "highest") };
}, () => ({ q: k.tensor([${B}, ${H}, ${L}, ${D}]), kk: k.tensor([${B}, ${H}, ${S}, ${D}]), v: k.tensor([${B}, ${H}, ${S}, ${D}]), mask: k.tensor([${B}, 1, ${L}, ${S}]) }));`;
const t = target(SPECS.gb10);
const c = compileScript(script, { params: paramSet([]), target: t, contraction: "separate", matmulPrecision: "highest" });
if (!c.ok) { console.log(c.diags); process.exit(1); }
console.log(`shape B=${B} H=${H} L=${L} S=${S} D=${D}`);
for (const lvl of ["loop", "tile"]) {
  const g = c.run.at(lvl);
  const ks = [...g.nodes.values()].filter((n) => n.name === `${lvl}.kernel`);
  console.log(`\n== ${lvl}: ${ks.length} kernels`);
  for (const n of ks) {
    const line = `${n.attrs.name ?? "?"} shape=[${n.attrs.shape}] reds=${schedule(n.attrs.expr, n.attrs.shape).reds.length}`;
    if (lvl === "tile") { const e = estimate(analyze(n.attrs.expr, n.attrs.shape, n.attrs.inShapes), n.attrs.map, t); console.log(line, JSON.stringify(n.attrs.map), `us=${e.us.toFixed(1)} bound=${e.bound} dramMB=${(e.dram / 1048576).toFixed(2)} smem=${e.smem}`); }
    else { console.log(line); if (process.env.NEST) console.log(printNest(schedule(n.attrs.expr, n.attrs.shape))); }
  }
  if (lvl === "tile") console.log(`predictedCost total us=${predictedCost(g, t).toFixed(1)}`);
}
