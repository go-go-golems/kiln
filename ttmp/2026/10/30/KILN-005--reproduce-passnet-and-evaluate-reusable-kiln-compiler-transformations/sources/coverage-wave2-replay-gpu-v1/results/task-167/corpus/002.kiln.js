project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.expect(N.conv2d(v0, v1, v2, {"stride": [1, 1], "padding": [0, 0], "dilation": [1, 1], "groups": 1}), [32, 1024, 1, 1], "f16");
const v5 = N.expect(N.cast(N.select(N.lt(N.cast(v4, "f32"), -3), 0, N.select(N.gt(N.cast(v4, "f32"), 3), 1, N.add(N.div(N.cast(v4, "f32"), 6), 0.5))), "f16"), [32, 1024, 1, 1], "f16");
const v6 = N.expect(N.mul(v3, v5), [32, 1024, 8, 8], "f16");
const v7 = N.expect(N.adaptiveAvgPool2d(v6, [1, 1]), [32, 1024, 1, 1], "f16");
const v8 = N.expect(N.reshape(v7, [32, 1024]), [32, 1024], "f16");
const v9 = N.expect(v8, [32, 1024], "f16");
return {out0: v9};
}, {v0: k.tensor([32, 1024, 1, 1], "f16"), v1: k.tensor([1024, 1024, 1, 1], "f16"), v2: k.tensor([1024], "f16"), v3: k.tensor([32, 1024, 8, 8], "f16")});
