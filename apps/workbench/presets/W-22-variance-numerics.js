/** W-22 Variance three ways: speed vs. numerics
 *  group  GPU optimization
 *  about  the same statistic computed two-pass, one-pass (E[x²] − E[x]²) and shifted one-pass; slide the data's offset and watch fp32 destroy one of them
 *  try    At what offset does the one-pass formula fail, and why does it fail on the GPU but not in the reference? | Is the two-pass version actually slower here?
 */
// Var(x) = E[(x − μ)²] = E[x²] − μ². Mathematically identical, numerically not: when the mean is large
// next to the spread, E[x²] and μ² are two huge, nearly equal numbers, and their difference in fp32 is
// mostly rounding error (catastrophic cancellation). LayerNorm needs this statistic for every row.
// The simulator computes in fp32 like the GPU; the reference accumulates in fp64. See the Notes.
const offset = param.enum("offset", [0, 1, 10, 100, 1000, 10000], { default: 0, help: "added to every input: the mean moves, the spread stays" });
const rows = param.int("rows", { min: 16, max: 8192, default: 1024, scale: "log" });
const dim = param.int("dim", { min: 64, max: 8192, default: 2048, scale: "log" });

project("variance")
  .params(offset, rows, dim)
  .program(({ x }, { param }) => {
    const D = param(dim);
    const xs = N.add(x, param(offset));                        // inputs are uniform on [−1, 1): σ² = 1/3
    const mean = (t) => N.mul(N.sum(t, -1), 1 / D);            // each method computes its own means, so each
    // output is one self-contained kernel (and each kernel's check sees the real arithmetic)
    const two_pass = mean(N.square(N.sub(xs, mean(xs))));                  // E[(x − μ)²]
    const one_pass = N.sub(mean(N.square(xs)), N.square(mean(xs)));        // E[x²] − μ²
    const xk = N.sub(xs, N.slice(xs, -1, 0, 1));                           // shift by the row's first value K
    const shifted = N.sub(mean(N.square(xk)), N.square(mean(xk)));         // E[(x−K)²] − E[x−K]²
    return { two_pass, one_pass, shifted };
  }, ({ param }) => ({ x: k.tensor([param(rows), param(dim)]) }))
  .check("the reference variance is 1/3 (inputs are uniform on [−1, 1))", ({ outputs }) => {
    const v = outputs.two_pass.data, m = v.reduce((a, b) => a + b, 0) / v.length;
    return Math.abs(m - 1 / 3) < 0.01 || `mean of the row variances ${m}`;
  });
