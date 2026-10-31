project("passnet").program(({v0, v1, v2}) => {
const v3 = N.conv2d(v2, v1, v0, {"stride": [1, 1], "padding": [0, 0], "dilation": [1, 1], "groups": 1});
const v4 = N.reshape(v3, [32, 1000]);
return {out0: v4};
}, {v0: k.tensor([1000], "f32"), v1: k.tensor([1000, 1024, 1, 1], "f32"), v2: k.tensor([32, 1024, 1, 1], "f32")});
