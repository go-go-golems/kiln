project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.conv2d(v0, v1, v2, {"stride": [1, 1], "padding": [0, 0], "dilation": [1, 1], "groups": 1});
const v5 = N.cast(N.sigmoid(N.cast(v4, "f32")), "f16");
const v6 = N.mul(v3, v5);
const v7 = N.cast(N.gelu(N.cast(v6, "f32"), "none"), "f16");
const v8 = N.adaptiveAvgPool2d(v7, [1, 1]);
const v9 = N.reshape(v8, [1, 1024]);
const v10 = v9;
return {out0: v10};
}, {v0: k.tensor([1, 64, 1, 1], "f16"), v1: k.tensor([1024, 64, 1, 1], "f16"), v2: k.tensor([1024], "f16"), v3: k.tensor([1, 1024, 8, 8], "f16")});
