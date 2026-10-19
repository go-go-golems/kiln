import { k } from "../src/core/kiln.js";
import { Tensor, compare } from "../src/core/util.js";
import { nn, N, tensor, decomposition, optimization } from "../src/std/tensor.js";
import { loop, lift, fuse, stamp } from "../src/std/loop.js";
const pipe = k.pipeline("upper").ir("torch", { dialects: [nn, tensor] }).pass(decomposition).ir("tensor", { dialects: [tensor], strict: true }).pass(optimization).pass(lift).pass(fuse).pass(stamp).ir("loop", { dialects: [loop, tensor], strict: true }).build();
const cases = {
  rmsnorm: [k.trace("rmsnorm", ({ x }) => N.rms_norm(x, N.weight("w", [256]), { eps: 1e-6 }), { x: k.tensor([1, 8, 256]) }), { x: Tensor.random([1, 8, 256], { seed: 1 }) }],
  softmax: [k.trace("softmax", ({ x }) => N.softmax(x), { x: k.tensor([4, 8]) }), { x: Tensor.random([4, 8], { seed: 2 }) }],
  linear: [k.trace("linear", ({ x }) => N.linear(x, N.weight("w", [6, 5])), { x: k.tensor([4, 5]) }), { x: Tensor.random([4, 5], { seed: 3 }) }],
  mlp: [k.trace("mlp", ({ x }) => N.linear(N.relu(N.linear(x, N.weight("up", [32, 16]))), N.weight("down", [16, 32])), { x: k.tensor([8, 16]) }), { x: Tensor.random([8, 16], { seed: 4 }) }],
  gelu: [k.trace("gelu", ({ x }) => N.gelu(x), { x: k.tensor([32, 64]) }), { x: Tensor.random([32, 64], { seed: 5 }) }],
  layernorm_t: [k.trace("ln", ({ x }) => N.layer_norm(N.transpose(x), N.weight("g", [6], { init: "ones" }), N.weight("b", [6], { init: "zeros" })), { x: k.tensor([6, 10]) }), { x: Tensor.random([6, 10], { seed: 6 }) }],
};
for (const [name, [g, inputs]] of Object.entries(cases)) {
  const r = pipe.run(g);
  if (!r.ok) { console.log(name, "FAILED", r.error.message); process.exitCode = 1; continue; }
  const ref = g.eval(inputs).out;
  const got = r.graph.eval(inputs).out;
  const c = compare(got, ref, { rtol: 1e-4, atol: 1e-5 });
  const kernels = r.graph.findAll("loop.kernel");
  console.log(`== ${name}: ${kernels.length} kernel(s), ${r.steps.filter(s=>s.kind==='rewrite').length} rewrites, skips: ${r.steps.filter(s=>s.kind==='skip').map(s=>s.rule+': '+s.reason).slice(0,2).join(' | ')} → ${c.ok ? "OK" : "MISMATCH"} ${c.message}`);
  if (!c.ok) process.exitCode = 1;
  if (["rmsnorm", "softmax", "mlp"].includes(name)) console.log(r.at("loop").print({ header: false }));
}
