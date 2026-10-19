/** W-13 LayerNorm with a residual
 *  group  Write programs
 *  about  y = LayerNorm(x + r)·g + b: the residual add fuses into the norm's row kernel, so x + r is never stored
 *  try    Return x + r as a second output: what happens to the kernel count? | Compare with W-05 on the A100
 */
const rows = param.int("rows", { min: 16, max: 8192, default: 2048, scale: "log" });
const dim = param.int("dim", { min: 64, max: 8192, default: 1024, scale: "log" });

project("ln-residual")
  .params(rows, dim)
  .program(({ x, res }, { param }) => {
    const d = param(dim);
    return { y: N.layer_norm(N.add(x, res), std.weight("g", [d], { init: "ones" }), std.weight("b", [d], { init: "zeros" }), { eps: 1e-5 }) };
  }, ({ param }) => { const t = k.tensor([param(rows), param(dim)]); return { x: t, res: t }; })
  .check("one kernel", ({ run }) => run.graph.findAll("gpu.kernel").length === 1 || "the residual did not fuse")
  .check("each row has mean 0 and variance 1", ({ outputs }) => {
    const y = outputs.y, D = y.shape[1];
    for (let r = 0; r < y.shape[0]; r += Math.max(1, y.shape[0] >> 3)) {
      let m = 0, v = 0; for (let j = 0; j < D; j++) m += y.data[r * D + j]; m /= D;
      for (let j = 0; j < D; j++) v += (y.data[r * D + j] - m) ** 2; v /= D;
      if (Math.abs(m) > 1e-3 || Math.abs(v - 1) > 1e-2) return `row ${r}: mean ${m.toFixed(4)}, variance ${v.toFixed(4)}`;
    }
    return true;
  });
