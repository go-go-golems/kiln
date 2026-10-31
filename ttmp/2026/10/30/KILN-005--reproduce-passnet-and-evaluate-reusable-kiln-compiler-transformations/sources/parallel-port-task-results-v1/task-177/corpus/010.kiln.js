project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.conv2d(v0, v1, v2, {"stride": [1, 1], "padding": [0, 0], "dilation": [1, 1], "groups": 1});
const v5 = N.add(v4, 1.0);
const v6 = N.div(v5, 2.0);
const v7 = N.cast(N.select(N.gt(N.select(N.lt(N.cast(v6, "f32"), N.cast(N.cast(N.const(0.0, []), "bf16"), "f32")), N.cast(N.cast(N.const(0.0, []), "bf16"), "f32"), N.cast(v6, "f32")), N.cast(N.cast(N.const(1.0, []), "bf16"), "f32")), N.cast(N.cast(N.const(1.0, []), "bf16"), "f32"), N.select(N.lt(N.cast(v6, "f32"), N.cast(N.cast(N.const(0.0, []), "bf16"), "f32")), N.cast(N.cast(N.const(0.0, []), "bf16"), "f32"), N.cast(v6, "f32"))), "bf16");
const v8 = N.mul(v3, v7);
return {out0: v8};
}, {v0: k.tensor([32, 100, 1, 1], "bf16"), v1: k.tensor([400, 100, 1, 1], "bf16"), v2: k.tensor([400], "bf16"), v3: k.tensor([32, 400, 12, 16], "bf16")});
