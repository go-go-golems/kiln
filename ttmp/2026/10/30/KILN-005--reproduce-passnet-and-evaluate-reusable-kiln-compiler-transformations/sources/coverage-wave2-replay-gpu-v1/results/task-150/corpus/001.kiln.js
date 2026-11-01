project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.expect(N.conv2d(v0, v1, v2, {"stride": [1, 1], "padding": [0, 0], "dilation": [1, 1], "groups": 1}), [12, 2048, 64, 128], "f32");
const v5 = N.expect(N.reshape(v4, [1, 12, 2048, 64, 128]), [1, 12, 2048, 64, 128], "f32");
const v6 = N.expect(N.cast(N.reshape(N.sum(N.cast(v5, "f32"), 0, true), [12, 2048, 64, 128]), "f32"), [12, 2048, 64, 128], "f32");
const v7 = N.expect(N.concat([v6, v3], 1), [12, 4096, 64, 128], "f32");
return {out0: v7};
}, {v0: k.tensor([12, 256, 64, 128], "f32"), v1: k.tensor([2048, 256, 1, 1], "f32"), v2: k.tensor([2048], "f32"), v3: k.tensor([12, 2048, 64, 128], "f32")});
