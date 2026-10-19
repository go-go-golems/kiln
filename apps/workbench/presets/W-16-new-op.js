/** W-16 A new frontend op
 *  group  Extend the compiler
 *  about  add an op to the frontend with reference semantics, teach the decomposition pass to lower it, and it fuses like a built-in
 *  try    Add hard_sigmoid the same way | What does the strict tensor checkpoint say if you remove the decomposition?
 */
// hard_swish(x) = x · min(max(x + 3, 0), 6) / 6 (MobileNetV3). The op gets an eval (the reference every
// lower level is checked against), a type rule and a print form. A decomposition rule rewrites it into
// Tensor IR; pipeline.insertRule adds the rule to the standard decomposition pass. From there on it is
// ordinary tensor code: it lifts and fuses into the matmul's epilogue. (Put it BEFORE the linear and the
// fusion guard keeps it apart: inlined into the matmul it would be recomputed once per output column.)
const Ext = k.dialect("ext").describe("my frontend extensions")
  .op("hard_swish", { args: ["x"], traits: ["pure"], infer: ({ x }) => x.type, print: "hard_swish({x})",
    eval: ({ x }) => { const o = new Tensor(x.shape); for (let i = 0; i < o.data.length; i++) { const v = x.data[i]; o.data[i] = (v * Math.min(Math.max(v + 3, 0), 6)) / 6; } return o; } });

const lowerHardSwish = std.decompose("ext.hard_swish", ({ x }) => T.mul(x, T.div(T.ew("min", T.ew("max", T.add(x, 3), 0), 6), 6)));
const pipe = std.emmy.pipeline().insertRule("frontend/decomposition", lowerHardSwish)
  .withIr("torch", { dialects: [...std.emmy.pipeline().steps[0].opts.dialects, Ext] });

const tokens = param.int("tokens", { min: 16, max: 8192, default: 1024, scale: "log" });
const dim = param.int("dim", { min: 64, max: 8192, default: 1024, scale: "log" });
project("hard-swish")
  .pipeline(pipe)
  .params(tokens, dim)
  .program(({ x }, { param }) => ({ y: Ext.hard_swish(N.linear(x, std.weight("W", [param(dim), param(dim)]))) }), ({ param }) => ({ x: k.tensor([param(tokens), param(dim)]) }))
  .check("hard_swish fused into the matmul's epilogue", ({ run }) => run.graph.findAll("gpu.kernel").length === 1 || `${run.graph.findAll("gpu.kernel").length} kernels`);
