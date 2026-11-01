project("passnet").program(({v0, v1, v2}) => {
const v3 = N.expect(N.conv2d(v0, v1, v2, {"stride": [1, 1], "padding": [0, 0], "dilation": [1, 1], "groups": 1}), [32, 1280, 1, 1], "bf16");
const v4 = N.expect(N.cast(N.mul(N.cast(v3, "f32"), N.div(N.select(N.lt(N.cast(v3, "f32"), -3), 0, N.select(N.gt(N.cast(v3, "f32"), 3), 6, N.add(N.cast(v3, "f32"), 3))), 6)), "bf16"), [32, 1280, 1, 1], "bf16");
const v5 = N.expect(N.reshape(v4, [32, 1280]), [32, 1280], "bf16");
return {out0: v5};
}, {v0: k.tensor([32, 960, 1, 1], "bf16"), v1: k.tensor([1280, 960, 1, 1], "bf16"), v2: k.tensor([1280], "bf16")});
