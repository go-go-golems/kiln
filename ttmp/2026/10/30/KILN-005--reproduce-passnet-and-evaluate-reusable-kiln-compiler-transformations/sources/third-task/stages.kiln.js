project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.conv2d(v3, v1, v0, {"stride": [2, 2], "padding": [1, 1], "dilation": [1, 1], "groups": 1});
const v5 = N.relu(v4);
const v6 = N.add(v2, v5);
const v7 = N.resizeBilinear(v6, [24, 24]);
return {conv: v4, relu: v5, residual: v6, out0: v7};
}, {v0: k.tensor([128], "f16"), v1: k.tensor([128, 256, 3, 3], "f16"), v2: k.tensor([1, 128, 24, 24], "f16"), v3: k.tensor([1, 256, 48, 48], "f16")});
