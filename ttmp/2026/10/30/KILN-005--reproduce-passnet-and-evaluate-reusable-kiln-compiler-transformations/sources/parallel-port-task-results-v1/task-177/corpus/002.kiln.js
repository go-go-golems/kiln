project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.conv2d(v0, v1, v2, {"stride": [1, 1], "padding": [0, 0], "dilation": [1, 1], "groups": 1});
const v5 = N.add(v4, 3.0);
const v6 = N.div(v5, 6.0);
const v7 = N.cast(N.select(N.gt(N.select(N.lt(N.cast(v6, "f32"), N.cast(N.cast(N.const(0.0, []), "f32"), "f32")), N.cast(N.cast(N.const(0.0, []), "f32"), "f32"), N.cast(v6, "f32")), N.cast(N.cast(N.const(1.0, []), "f32"), "f32")), N.cast(N.cast(N.const(1.0, []), "f32"), "f32"), N.select(N.lt(N.cast(v6, "f32"), N.cast(N.cast(N.const(0.0, []), "f32"), "f32")), N.cast(N.cast(N.const(0.0, []), "f32"), "f32"), N.cast(v6, "f32"))), "f32");
const v8 = N.mul(v3, v7);
return {out0: v8};
}, {v0: k.tensor([1, 120, 1, 1], "f32"), v1: k.tensor([480, 120, 1, 1], "f32"), v2: k.tensor([480], "f32"), v3: k.tensor([1, 480, 64, 128], "f32")});
