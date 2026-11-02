// KILN-007 experiment: is fully fused attention already one Loop IR expression? Replace the fusion pass with an
// unguarded one (a decide policy that accepts every fusion), then report the kernel count, the Loop IR nest, the legal Tile maps,
// the model's prediction, and the Loop IR evaluation against the default (guarded) pipeline on random inputs.
// Usage: node .../scripts/03-forced-fusion-single-kernel.mjs [B H L S D]
import { SPECS, target } from "../../../../../../packages/kiln/src/std/targets.js";
import { compileScript } from "../../../../../../apps/workbench/src/compile.js";
import { params as paramSet, k } from "../../../../../../packages/kiln/src/core/kiln.js";
import { Tensor } from "../../../../../../packages/kiln/src/core/util.js";
import { createFusionRule, schedule, printNest, workOf } from "../../../../../../packages/kiln/src/std/loop.js";
import { analyze, legalMaps, estimate, predictedCost } from "../../../../../../packages/kiln/src/std/tile.js";
const [B, H, L, S, D] = (process.argv.slice(2).length ? process.argv.slice(2) : ["1", "2", "5", "7", "4"]).map(Number);
const script = `project("sdpa").program(({ q, kk, v, mask }) => {
  const s = N.add(N.mul(N.matmul(q, N.transpose(kk, -2, -1), "highest"), ${1 / Math.sqrt(D)}), mask);
  return { out: N.matmul(N.softmax(s, -1), v, "highest") };
}, () => ({ q: k.tensor([${B}, ${H}, ${L}, ${D}]), kk: k.tensor([${B}, ${H}, ${S}, ${D}]), v: k.tensor([${B}, ${H}, ${S}, ${D}]), mask: k.tensor([${B}, 1, ${L}, ${S}]) }));`;
const t = target(SPECS.gb10);
const opts = { params: paramSet([]), target: t, contraction: "separate", matmulPrecision: "highest" };
const unguarded = k.pass("loop/fusion").short("f").rules(createFusionRule({ decide: () => true })).order("reverse");
const base = compileScript(script, opts);
const forced = compileScript(script, { ...opts, transformPipeline: (p) => p.replace("loop/fusion", unguarded) });
if (!base.ok || !forced.ok) { console.log(base.diags, forced.diags); process.exit(1); }
const kernels = (c, lvl) => [...c.run.at(lvl).nodes.values()].filter((n) => n.name === `${lvl}.kernel`);
console.log(`shape B=${B} H=${H} L=${L} S=${S} D=${D}: guarded ${kernels(base, "loop").length} kernels, unguarded ${kernels(forced, "loop").length}`);
for (const n of kernels(forced, "loop")) {
  const sc = schedule(n.attrs.expr, n.attrs.shape);
  console.log(`\n${n.attrs.name} shape=[${n.attrs.shape}] reductions=${sc.reds.length} work=${workOf(sc).toExponential(3)}`);
  if (process.env.NEST) console.log(printNest(sc));
}
for (const n of kernels(forced, "tile")) {
  const an = analyze(n.attrs.expr, n.attrs.shape, n.attrs.inShapes);
  console.log(`tile ${n.attrs.name}: legal maps ${legalMaps(an).join(",")}, chosen ${JSON.stringify(n.attrs.map)}, model ${estimate(an, n.attrs.map, t).us.toFixed(1)} us`);
}
console.log(`predictedCost guarded ${predictedCost(base.run.at("tile"), t).toFixed(1)} us, unguarded ${predictedCost(forced.run.at("tile"), t).toFixed(1)} us`);
let seed = 11; const r = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 2 ** 32 * 2 - 1; };
const mk = (s) => new Tensor(s, Float32Array.from({ length: s.reduce((a, b) => a * b, 1) }, r), "f32");
const inputs = { q: mk([B, H, L, D]), kk: mk([B, H, S, D]), v: mk([B, H, S, D]), mask: mk([B, 1, L, S]) };
const a = base.run.at("loop").eval(inputs).out.data, b = forced.run.at("loop").eval(inputs).out.data, ref = base.graph.eval(inputs).out.data;
let e1 = 0, e2 = 0; for (let i = 0; i < a.length; i++) { e1 = Math.max(e1, Math.abs(a[i] - ref[i])); e2 = Math.max(e2, Math.abs(b[i] - ref[i])); }
console.log(`max abs vs frontend reference: guarded loop ${e1.toExponential(2)}, unguarded loop ${e2.toExponential(2)}`);
