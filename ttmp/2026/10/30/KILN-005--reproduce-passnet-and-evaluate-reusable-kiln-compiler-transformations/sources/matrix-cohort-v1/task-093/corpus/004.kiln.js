project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.cast(N.linear(N.cast(v0, "f32"), N.cast(v1, "f32"), N.cast(v2, "f32")), "bf16");
const v5 = N.cast(N.reshape(N.mul(N.sum(N.cast(v3, "f32"), 1, true), 0.02040816326530612), [256, 448]), "bf16");
return {out0: v4, out1: v5};
}, {v0: k.tensor([256, 448], "bf16"), v1: k.tensor([2, 448], "bf16"), v2: k.tensor([2], "bf16"), v3: k.tensor([256, 49, 448], "bf16")});
