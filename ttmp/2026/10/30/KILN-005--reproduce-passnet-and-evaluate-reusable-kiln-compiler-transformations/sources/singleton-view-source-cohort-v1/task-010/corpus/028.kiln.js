project("passnet").program(({v0, v1, v2}) => {
const v3 = N.conv2d(v0, v1, v2, {"stride": [1, 1], "padding": [0, 0], "dilation": [1, 1], "groups": 1});
const v4 = N.reshape(v3, [128, 1, 48]);
const v5 = N.cast(N.softmax(N.cast(v4, "f32"), 2), "f32");
const v6 = N.reshape(v5, [128, 1, 48, 1]);
return {out0: v6};
}, {v0: k.tensor([128, 608, 8, 6], "f32"), v1: k.tensor([1, 608, 1, 1], "f32"), v2: k.tensor([1], "f32")});
