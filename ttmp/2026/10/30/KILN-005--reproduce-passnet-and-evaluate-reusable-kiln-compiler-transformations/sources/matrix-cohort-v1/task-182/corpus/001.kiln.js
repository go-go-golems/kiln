project("passnet").program(({v0, v1, v2, v3, v4, v5}) => {
const v6 = N.mul(v0, v1);
const v7 = N.cast(N.add(N.mul(N.div(N.sub(N.cast(v6, "f32"), N.reshape(N.cast(v2, "f32"), [1, 256, 1, 1])), N.sqrt(N.add(N.reshape(N.cast(v3, "f32"), [1, 256, 1, 1]), 1e-05))), N.reshape(N.cast(v4, "f32"), [1, 256, 1, 1])), N.reshape(N.cast(v5, "f32"), [1, 256, 1, 1])), "bf16");
const v8 = N.cast(N.silu(N.cast(v7, "f32")), "bf16");
return {out0: v8};
}, {v0: k.tensor([16, 256, 56, 56], "bf16"), v1: k.tensor([16, 256, 1, 1], "bf16"), v2: k.tensor([256], "bf16"), v3: k.tensor([256], "bf16"), v4: k.tensor([256], "bf16"), v5: k.tensor([256], "bf16")});
