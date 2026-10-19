/** W-09 MLP and the blowup guard
 *  group  ML compiler
 *  about  fusion stops where it would recompute work: a GELU or SwiGLU MLP keeps its matmuls apart
 *  try    Why are there exactly these kernels? Show me the guard's decline | Switch act to swiglu
 */
// Fusing a producer into its consumer inlines the producer's whole computation at every use. For an
// elementwise producer that is free; for a matmul feeding another matmul it multiplies the work by the
// hidden size. The fusion rule's guard compares the work before and after (workOf, with a memory weight)
// and declines: Trace → Declined shows "would multiply work by …". The activation still fuses into the
// first matmul's epilogue.
const act = param.enum("act", ["gelu", "swiglu"], { default: "gelu" });
const T_ = param.int("tokens", { min: 16, max: 4096, default: 512, scale: "log" });
const D = param.int("dim", { min: 64, max: 4096, default: 512, scale: "log" });
const H = param.int("hidden", { min: 64, max: 8192, default: 1024, scale: "log" });

project("mlp")
  .params(act, T_, D, H)
  .program(({ x }, { param }) => {
    const d = param(D), h = param(H);
    if (param(act) === "gelu") return { y: N.linear(N.gelu(N.linear(x, std.weight("up", [h, d]))), std.weight("down", [d, h])) };
    const g = N.silu(N.linear(x, std.weight("gate", [h, d])));
    return { y: N.linear(N.mul(g, N.linear(x, std.weight("up", [h, d]))), std.weight("down", [d, h])) };
  }, ({ param }) => ({ x: k.tensor([param(T_), param(D)]) }))
  .check("matmuls stay separate kernels", ({ run }) => {
    const ks = run.graph.findAll("gpu.kernel").length;
    return ks >= 2 || `only ${ks} kernel: fusion recomputed a matmul`;
  });
