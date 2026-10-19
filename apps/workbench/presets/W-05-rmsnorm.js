/** W-05 RMSNorm, fused
 *  group  ML compiler
 *  about  one PyTorch-style op through six IRs into one row-mapped CUDA kernel, as in the CloudRift post
 *  try    Why is this one kernel and not four? | Pin TPB=128 for the kernel and measure the difference
 */
// RMSNorm(x) = x / sqrt(mean(x²) + eps) * w. The frontend op decomposes into a reduction, a divide, an
// rsqrt and two multiplies (tensor IR); lifting and fusion turn them into ONE loop kernel (loop IR); the
// tile pass picks a GPU mapping from a fork of schedules (row-per-block here); the kernel pass makes it
// cooperative (staged rows in shared memory, a tree reduction); emit prints CUDA and WGSL.
const rows = param.int("rows", { min: 16, max: 4096, default: 1024, scale: "log", help: "batch × sequence" });
const dim = param.int("dim", { min: 64, max: 8192, default: 4096, scale: "log", help: "hidden size" });

project("rmsnorm")
  .params(rows, dim)
  .program(({ x }, { param }) => ({ y: N.rms_norm(x, std.weight("w", [param(dim)]), { eps: 1e-6 }) }),
           ({ param }) => ({ x: k.tensor([param(rows), param(dim)]) }))
  .about("y = x · rsqrt(mean(x²) + ε) · w");
