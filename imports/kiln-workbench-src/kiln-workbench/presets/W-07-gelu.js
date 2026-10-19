/** W-07 GELU, pointwise
 *  group  ML compiler
 *  about  a chain of elementwise ops becomes one thread-per-element kernel; COARSEN and TPB are the knobs
 *  try    Why is this kernel bound by DRAM? | Pin COARSEN=4 and compare
 */
// GELU (tanh approximation) on a bias-shifted input: y = gelu(x + b) · s. Seven elementwise ops, one
// kernel: every thread reads x[i] and b[j] once and writes y[i] once. Arithmetic intensity is ~2 flop/B,
// so on any GPU this kernel lives under the memory roof — check the Roofline in Perf.
const n = param.int("tokens", { min: 64, max: 65536, default: 8192, scale: "log" });
const d = param.int("hidden", { min: 64, max: 8192, default: 2048, scale: "log" });

project("gelu")
  .params(n, d)
  .program(({ x }, { param }) => {
    const b = std.weight("bias", [param(d)]);
    return { y: N.mul(N.gelu(N.add(x, b)), 0.5) };
  }, ({ param }) => ({ x: k.tensor([param(n), param(d)]) }));
