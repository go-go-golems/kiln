project("passnet").program(({v0, v1, v2, v3, v4}) => {
const v5 = N.conv2d(v4, v1, v0, {"stride": [1, 1], "padding": [0, 0], "dilation": [1, 1], "groups": 1});
const v6 = N.cast(N.sigmoid(N.cast(v5, "f32")), "f32");
const v7 = N.mul(v3, v6);
const v8 = N.add(v7, v2);
return {out0: v8};
}, {v0: k.tensor([256], "f32"), v1: k.tensor([256, 16, 1, 1], "f32"), v2: k.tensor([1, 256, 64, 64], "f32"), v3: k.tensor([1, 256, 64, 64], "f32"), v4: k.tensor([1, 16, 1, 1], "f32")});
