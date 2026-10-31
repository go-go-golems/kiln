project("passnet").program(({v0, v1}) => {
const v2 = N.conv2d(v0, v1, null, {"stride": [1, 1], "padding": [1, 1], "dilation": [1, 1], "groups": 1});
const v3 = N.maxPool2d(v2, {"kernel_size": [3, 3], "stride": [2, 2], "padding": [1, 1], "dilation": [1, 1], "ceil_mode": false, "return_indices": false});
return {out0: v3};
}, {v0: k.tensor([1, 32, 128, 128], "bf16"), v1: k.tensor([64, 32, 3, 3], "bf16")});
