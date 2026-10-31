project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.conv2d(v0, v1, v2, {"stride": [1, 1], "padding": [0, 0], "dilation": [1, 1], "groups": 1});
const v5 = N.cast(N.select(N.gt(N.select(N.lt(N.cast(v3, "f32"), N.cast(N.cast(N.const(0.0, []), "f32"), "f32")), N.cast(N.cast(N.const(0.0, []), "f32"), "f32"), N.cast(v3, "f32")), N.cast(N.cast(N.const(6.0, []), "f32"), "f32")), N.cast(N.cast(N.const(6.0, []), "f32"), "f32"), N.select(N.lt(N.cast(v3, "f32"), N.cast(N.cast(N.const(0.0, []), "f32"), "f32")), N.cast(N.cast(N.const(0.0, []), "f32"), "f32"), N.cast(v3, "f32"))), "f32");
const v6 = N.mul(v5, v4);
return {out0: v6};
}, {v0: k.tensor([1, 24, 56, 56], "f32"), v1: k.tensor([96, 24, 1, 1], "f32"), v2: k.tensor([96], "f32"), v3: k.tensor([1, 96, 56, 56], "f32")});
