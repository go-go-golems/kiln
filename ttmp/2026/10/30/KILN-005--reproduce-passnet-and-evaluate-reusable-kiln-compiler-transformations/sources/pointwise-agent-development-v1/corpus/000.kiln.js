project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.conv2d(v3, v1, v0, {"stride": [1, 1], "padding": [0, 0], "dilation": [1, 1], "groups": 1});
const v5 = N.mul(v4, 0.17);
const v6 = N.add(v5, v2);
return {out0: v6};
}, {v0: k.tensor([320], "f32"), v1: k.tensor([320, 128, 1, 1], "f32"), v2: k.tensor([1, 320, 29, 29], "f32"), v3: k.tensor([1, 128, 29, 29], "f32")});
