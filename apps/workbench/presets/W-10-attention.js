/** W-10 Attention
 *  group  ML compiler
 *  about  softmax(QKᵀ/√d)·V for several heads: batched tiled matmuls around a fused scale-and-softmax
 *  try    Add a causal mask with N.select and N.lt | Which kernel dominates, and what bounds it?
 */
// Scaled dot-product attention, batched over heads. The scale fuses into the softmax kernel; the two
// matmuls are batched contractions the tile pass maps like W-08 (with the head as a grid dimension).
const heads = param.int("heads", { min: 1, max: 32, default: 8 });
const seq = param.int("seq", { min: 16, max: 2048, default: 256, scale: "log" });
const dk = param.int("d_head", { min: 16, max: 128, default: 64, scale: "log" });

project("attention")
  .params(heads, seq, dk)
  .program(({ q, kk, v }, { param }) => {
    const s = N.mul(N.matmul(q, N.transpose(kk)), 1 / Math.sqrt(param(dk)));
    return { out: N.matmul(N.softmax(s, -1), v) };
  }, ({ param }) => { const t = k.tensor([param(heads), param(seq), param(dk)]); return { q: t, kk: t, v: t }; });
