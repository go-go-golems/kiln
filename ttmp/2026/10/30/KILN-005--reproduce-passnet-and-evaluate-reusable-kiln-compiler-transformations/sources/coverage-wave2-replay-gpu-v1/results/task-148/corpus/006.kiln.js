project("passnet").program(({v0, v1, v2}) => {
const v3 = N.expect(N.conv2d(v0, v1, v2, {"stride": [1, 1], "padding": [0, 0], "dilation": [1, 1], "groups": 1}), [256, 17, 64, 48], "f16");
const v4 = N.expect(N.reshape(v3, [256, 17, 3072]), [256, 17, 3072], "f16");
return {out0: v4};
}, {v0: k.tensor([256, 160, 64, 48], "f16"), v1: k.tensor([17, 160, 1, 1], "f16"), v2: k.tensor([17], "f16")});
