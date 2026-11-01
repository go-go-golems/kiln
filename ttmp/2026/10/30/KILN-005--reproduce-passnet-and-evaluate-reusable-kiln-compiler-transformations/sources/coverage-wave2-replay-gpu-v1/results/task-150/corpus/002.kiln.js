project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.expect(N.conv2d(v0, v1, v2, {"stride": [1, 1], "padding": [0, 0], "dilation": [1, 1], "groups": 1}), [24, 512, 64, 128], "f16");
const v5 = N.expect(N.reshape(v4, [1, 24, 512, 64, 128]), [1, 24, 512, 64, 128], "f16");
const v6 = N.expect(N.cast(N.reshape(N.sum(N.cast(v5, "f32"), 0, true), [24, 512, 64, 128]), "f16"), [24, 512, 64, 128], "f16");
const v7 = N.expect(N.concat([v6, v3], 1), [24, 1024, 64, 128], "f16");
return {out0: v7};
}, {v0: k.tensor([24, 256, 64, 128], "f16"), v1: k.tensor([512, 256, 1, 1], "f16"), v2: k.tensor([512], "f16"), v3: k.tensor([24, 512, 64, 128], "f16")});
