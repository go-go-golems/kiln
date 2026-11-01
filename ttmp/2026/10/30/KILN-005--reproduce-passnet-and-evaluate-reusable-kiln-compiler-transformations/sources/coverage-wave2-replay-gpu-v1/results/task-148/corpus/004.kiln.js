project("passnet").program(({v0, v1, v2}) => {
const v3 = N.expect(N.conv2d(v0, v1, v2, {"stride": [1, 1], "padding": [0, 0], "dilation": [1, 1], "groups": 1}), [128, 17, 64, 48], "f32");
const v4 = N.expect(N.reshape(v3, [128, 17, 3072]), [128, 17, 3072], "f32");
return {out0: v4};
}, {v0: k.tensor([128, 160, 64, 48], "f32"), v1: k.tensor([17, 160, 1, 1], "f32"), v2: k.tensor([17], "f32")});
