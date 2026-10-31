project("passnet").program(({v0, v1, v2, v3, v4}) => {
const v5 = N.conv2d(v4, v0, null, {"stride": [1, 1], "padding": [0, 0], "dilation": [1, 1], "groups": 1});
const v6 = N.add(v3, v5);
const v7 = N.resizeBilinear(v6, [64, 64]);
const v8 = N.cast(N.sigmoid(N.cast(v2, "f32")), "f32");
const v9 = N.sub(1, v8);
const v10 = N.mul(v9, v7);
const v11 = N.add(v10, v1);
return {out0: v11, out1: v8, out2: v7};
}, {v0: k.tensor([128, 512, 1, 1], "f32"), v1: k.tensor([2, 128, 64, 64], "f32"), v2: k.tensor([2, 128, 64, 64], "f32"), v3: k.tensor([2, 128, 8, 8], "f32"), v4: k.tensor([2, 512, 8, 8], "f32")});
