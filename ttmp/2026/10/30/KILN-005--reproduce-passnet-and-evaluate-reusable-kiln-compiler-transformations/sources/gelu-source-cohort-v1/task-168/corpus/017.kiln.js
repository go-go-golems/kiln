project("passnet").program(({v0, v1, v2}) => {
const v3 = N.conv2d(v0, v1, v2, {"stride": [1, 1], "padding": [1, 1], "dilation": [1, 1], "groups": 256});
const v4 = N.cast(N.gelu(N.cast(v3, "f32"), "none"), "f32");
const v5 = v4;
return {out0: v5};
}, {v0: k.tensor([1, 256, 28, 28], "f32"), v1: k.tensor([256, 1, 3, 3], "f32"), v2: k.tensor([256], "f32")});
