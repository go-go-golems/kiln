project("passnet").program(({v0, v1}) => {
const v2 = N.conv2d(v1, v0, null, {"stride": [1, 1], "padding": [0, 0], "dilation": [1, 1], "groups": 1});
const v3 = N.reshape(v2, [1, 2, 1024, 1, 1]);
return {out0: v3};
}, {v0: k.tensor([2048, 64, 1, 1], "f32"), v1: k.tensor([1, 64, 1, 1], "f32")});
