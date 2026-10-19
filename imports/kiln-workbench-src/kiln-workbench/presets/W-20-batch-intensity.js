/** W-20 Batch size and arithmetic intensity
 *  group  GPU optimization
 *  about  one linear layer, from batch 1 (LLM decoding: memory-bound) to batch 1024 (prefill: compute-bound); the weights are the bytes
 *  try    Why does batch 8 cost almost the same as batch 1? | At what batch does this layer stop being memory-bound on the H100?
 */
// y = x · Wᵀ with W of shape (d, d). The weights are read once per call whatever the batch, so the bytes
// barely change with the batch M while the flops grow linearly: intensity ≈ M/2 flop per byte for small M.
// Decoding one token at a time (M = number of concurrent sequences) sits far left on the roofline;
// prefill (M = prompt length) sits far right. See the Notes for the derivation.
const M = param.int("batch", { min: 1, max: 1024, default: 1, scale: "log", help: "rows of x: tokens processed together" });
const d = param.int("d_model", { min: 512, max: 4096, default: 2048, scale: "log", help: "W is d×d" });

project("batch")
  .params(M, d)
  .program(({ x }, { param }) => ({ y: N.linear(x, std.weight("W", [param(d), param(d)])) }), ({ param }) => ({ x: k.tensor([param(M), param(d)]) }))
  .check("arithmetic intensity", ({ run }) => {
    const m = run.params.get(M), n = run.params.get(d);
    const flops = 2 * m * n * n, bytes = 4 * (m * n + n * n + m * n);
    return { ok: true, message: `${(flops / 1e6).toFixed(1)} MFLOP over ${(bytes / 1048576).toFixed(1)} MiB: ${(flops / bytes).toFixed(2)} flop/byte (≈ M/2 = ${(m / 2).toFixed(1)} for small M)` };
  });
