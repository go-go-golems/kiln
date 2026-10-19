/** W-24 One program, five GPUs
 *  group  GPU optimization
 *  about  a GPT-2-sized MLP block compiled and measured for five GPUs: the ridge point, the SM count and the shared memory change which schedule wins and which resource binds
 *  try    Measure on every simulated GPU and explain why the Orin is not just a slower 5090 | Which kernel changes schedule between the A100 and the RTX 5090, and why?
 */
// x → RMSNorm → Linear(d → 4d) → GELU → Linear(4d → d) → + x, the feed-forward half of a transformer
// layer at GPT-2-small width. Switch the device (header pill, or the links in the Notes) and the
// whole program recompiles for that GPU's limits and cost model; "Every simulated GPU" in Perf
// measures it on all five. The evidence store keys every measurement by device.
const tokens = param.int("tokens", { min: 16, max: 2048, default: 256, scale: "log" });
const d = param.int("d_model", { min: 128, max: 2048, default: 768, scale: "log" });

project("mlp-block")
  .params(tokens, d)
  .program(({ x }, { param }) => {
    const D = param(d), H = 4 * D;
    const h = N.rms_norm(x, std.weight("g", [D], { init: "ones" }), { eps: 1e-6 });
    const up = N.gelu(N.linear(h, std.weight("W_up", [H, D])));
    return { y: N.add(x, N.linear(up, std.weight("W_down", [D, H]))) };
  }, ({ param }) => ({ x: k.tensor([param(tokens), param(d)]) }))
  .check("ridge point of this device", ({ run }) => {
    const t = run.ctx.target;
    return { ok: true, message: `${t.name}: ${t.peakTflops} TFLOP/s ÷ ${t.bwGBs} GB/s = ${(t.peakTflops * 1000 / t.bwGBs).toFixed(1)} flop/byte; ${t.sms} SMs` };
  });
