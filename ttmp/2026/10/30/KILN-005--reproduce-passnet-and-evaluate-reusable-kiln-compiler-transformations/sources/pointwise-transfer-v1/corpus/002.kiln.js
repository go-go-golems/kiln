project("passnet").program(({v0, v1, v2, v3, v4}) => {
const v5 = N.conv2d(v4, v1, v0, {"stride": [1, 1], "padding": [0, 0], "dilation": [1, 1], "groups": 1});
const v6 = N.cast(N.sigmoid(N.cast(v5, "f32")), "f32");
const v7 = N.mul(v3, v6);
const v8 = N.add(v7, v2);
const v9 = N.relu(v8);
return {out0: v9};
}, {v0: k.tensor([2048], "f32"), v1: k.tensor([2048, 128, 1, 1], "f32"), v2: k.tensor([1, 2048, 12, 9], "f32"), v3: k.tensor([1, 2048, 12, 9], "f32"), v4: k.tensor([1, 128, 1, 1], "f32")});
