project("passnet").program(({v0}) => {
const v1 = N.cast(N.gelu(N.cast(v0, "f32"), "none"), "bf16");
const v2 = N.cast(N.mul(N.sum(N.sum(N.cast(v1, "f32"), 2, true), 3, true), 0.00031887755102040814), "bf16");
return {out0: v1, out1: v2};
}, {v0: k.tensor([256, 384, 56, 56], "bf16")});
