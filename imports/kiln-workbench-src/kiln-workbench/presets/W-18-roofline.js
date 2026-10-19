/** W-18 The roofline: three regimes
 *  group  GPU optimization
 *  about  one elementwise kernel and two sliders: work per element moves it from memory-bound to compute-bound; size moves it to launch-bound
 *  try    At what degree does this kernel become compute-bound on the A100, and why is that lower than on the RTX 5090? | Explain the time at 4096 elements
 */
// y = p(x), a polynomial of degree d evaluated per element in Horner form:
//   y = ((…((c_d·x + c_{d−1})·x + c_{d−2})·x …)·x + c_0
// Each degree costs one multiply and one add (2 flops); every element costs 8 bytes of DRAM traffic
// (read x, write y) whatever the degree. So the arithmetic intensity is d/4 flop per byte: the degree
// slider walks the kernel along the roofline's x axis. See the Notes.
const n = param.int("elements", { min: 1024, max: 16777216, default: 4194304, scale: "log", help: "tensor size" });
const degree = param.int("degree", { min: 1, max: 256, default: 8, scale: "log", help: "polynomial degree: 2·degree flops per element" });

project("roofline")
  .params(n, degree)
  .program(({ x }, { param }) => {
    const d = param(degree);
    const c = (i) => 1 / (i + 1);                     // coefficients stay small: p(x) is bounded on [−1, 1)
    let y = N.add(N.mul(x, c(d)), c(d - 1));
    for (let i = d - 2; i >= 0; i--) y = N.add(N.mul(y, x), c(i));
    return { y };
  }, ({ param }) => ({ x: k.tensor([param(n)]) }))
  .check("one kernel, 2·degree flops per element", ({ run }) => {
    const ks = run.graph.findAll("gpu.kernel");
    return ks.length === 1 || `${ks.length} kernels`;
  });
