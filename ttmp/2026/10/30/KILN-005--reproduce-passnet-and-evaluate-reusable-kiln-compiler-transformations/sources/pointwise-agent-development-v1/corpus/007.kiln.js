project("passnet").program(({v0, v1, v2, v3, v4}) => {
const v5 = N.conv2d(v2, v1, v0, {"stride": [1, 1], "padding": [0, 0], "dilation": [1, 1], "groups": 1});
const v6 = N.reshape(v5, [1, 32, 400]);
const v7 = N.concat([v3, v4, v6], 2);
return {out0: v7};
}, {v0: k.tensor([32], "f32"), v1: k.tensor([32, 64, 1, 1], "f32"), v2: k.tensor([1, 64, 20, 20], "f32"), v3: k.tensor([1, 32, 6400], "f32"), v4: k.tensor([1, 32, 1600], "f32")});
