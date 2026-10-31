project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.conv2d(v0, v1, v2, {"stride": [1, 1], "padding": [0, 0], "dilation": [1, 1], "groups": 1});
const v5 = N.cast(N.select(N.gt(N.select(N.lt(N.cast(v3, "f32"), N.cast(N.cast(N.const(0.0, []), "bf16"), "f32")), N.cast(N.cast(N.const(0.0, []), "bf16"), "f32"), N.cast(v3, "f32")), N.cast(N.cast(N.const(6.0, []), "bf16"), "f32")), N.cast(N.cast(N.const(6.0, []), "bf16"), "f32"), N.select(N.lt(N.cast(v3, "f32"), N.cast(N.cast(N.const(0.0, []), "bf16"), "f32")), N.cast(N.cast(N.const(0.0, []), "bf16"), "f32"), N.cast(v3, "f32"))), "bf16");
const v6 = N.mul(v5, v4);
return {out0: v6};
}, {v0: k.tensor([128, 24, 56, 56], "bf16"), v1: k.tensor([96, 24, 1, 1], "bf16"), v2: k.tensor([96], "bf16"), v3: k.tensor([128, 96, 56, 56], "bf16")});
