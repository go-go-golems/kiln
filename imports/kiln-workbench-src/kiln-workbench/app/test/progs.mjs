import { k } from "../src/core/kiln.js";
import { Tensor, compare, fmtUs } from "../src/core/util.js";
import { N } from "../src/std/tensor.js";
import { pipeline } from "../src/std/emmy.js";
import { programOf, simulateKernel } from "../src/std/program.js";
import { SPECS, target } from "../src/std/targets.js";
const T = target(SPECS.rtx5090);
const pipe = pipeline({ target: T });
const progs = {
  attention: k.trace("attention", ({ q, kk, v }) => N.matmul(N.softmax(N.mul(N.matmul(q, N.transpose(kk)), 0.125)), v), { q: k.tensor([4, 64, 32]), kk: k.tensor([4, 64, 32]), v: k.tensor([4, 64, 32]) }),
  nbody: k.trace("nbody", ({ p }) => {
    const d = N.sub(N.reshape(p, [1, 256, 3]), N.reshape(p, [256, 1, 3]));
    const r2 = N.add(N.sum(N.square(d), -1), 0.01);
    const inv = N.pow(r2, -1.5);
    return N.sum(N.mul(d, inv), 1, false);
  }, { p: k.tensor([256, 3]) }),
  blur: k.trace("blur", ({ img }) => {
    const H = 64, W = 64;
    let acc = null;
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) { const s = N.slice(N.slice(img, 0, dy, dy + H), 1, dx, dx + W); acc = acc ? N.add(acc, s) : s; }
    return N.mul(acc, 1 / 9);
  }, { img: k.tensor([66, 66]) }),
  swiglu: k.trace("mlp", ({ x }) => N.linear(N.mul(N.silu(N.linear(x, N.weight("gate", [128, 64]))), N.linear(x, N.weight("up", [128, 64]))), N.weight("down", [64, 128])), { x: k.tensor([16, 64]) }),
  layernorm: k.trace("ln", ({ x }) => N.layer_norm(x, N.weight("g", [512]), N.weight("b", [512])), { x: k.tensor([64, 512]) }),
};
for (const [name, g] of Object.entries(progs)) {
  const r = pipe.run(g);
  if (!r.ok) { console.log(name, "FAILED", r.error.message); process.exitCode = 1; continue; }
  const prog = programOf(r.graph);
  // end-to-end: frontend eval vs loop-level eval
  const ins = Object.fromEntries(g.inputs.map((i) => [i.name, Tensor.random(g.nodes.get(i.id).type.shape, { seed: 5, dist: "uniform" })]));
  const ref = g.eval(ins).out, lo = r.at("loop").eval(ins).out;
  const c = compare(lo, ref, { rtol: 1e-3, atol: 1e-4 });
  console.log(`== ${name}: ${prog.kernels.length} kernels; loop-level vs frontend: ${c.ok ? "ok" : "MISMATCH " + c.message}`);
  for (const kn of prog.kernels) { const s = simulateKernel(kn, T); console.log(`   ${kn.name.padEnd(30)} ${kn.row.padEnd(36)} ${fmtUs(s.metrics.us).padStart(9)} ${s.metrics.bound.padEnd(7)} check ${s.check.ok ? "ok" : "FAIL " + s.check.message} (${s.check.n})  ${s.simMs.toFixed(0)}ms`); if (!s.check.ok) process.exitCode = 1; }
}
