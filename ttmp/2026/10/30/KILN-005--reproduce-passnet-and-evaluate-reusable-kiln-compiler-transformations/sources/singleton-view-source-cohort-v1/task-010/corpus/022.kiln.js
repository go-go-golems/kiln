project("passnet").program(({v0, v1, v2}) => {
const v3 = N.conv2d(v0, v1, v2, {"stride": [1, 1], "padding": [0, 0], "dilation": [1, 1], "groups": 1});
const v4 = N.reshape(v3, [1, 1, 4096]);
const v5 = N.cast(N.softmax(N.cast(v4, "f32"), 2), "bf16");
const v6 = N.reshape(v5, [1, 1, 4096, 1]);
return {out0: v6};
}, {v0: k.tensor([1, 512, 64, 64], "bf16"), v1: k.tensor([1, 512, 1, 1], "bf16"), v2: k.tensor([1], "bf16")});
