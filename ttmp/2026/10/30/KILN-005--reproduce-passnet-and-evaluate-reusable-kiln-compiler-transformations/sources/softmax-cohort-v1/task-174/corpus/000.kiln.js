project("passnet").program(({v0, v1, v2}) => {
const v3 = N.conv2d(v0, v1, v2, {"stride": [1, 1], "padding": [0, 0], "dilation": [1, 1], "groups": 1});
const v4 = N.reshape(v3, [1, 1, 4096]);
const v5 = N.cast(N.softmax(N.cast(v4, "f32"), 2), "f32");
return {out0: v5};
}, {v0: k.tensor([1, 512, 64, 64], "f32"), v1: k.tensor([1, 512, 1, 1], "f32"), v2: k.tensor([1], "f32")});
