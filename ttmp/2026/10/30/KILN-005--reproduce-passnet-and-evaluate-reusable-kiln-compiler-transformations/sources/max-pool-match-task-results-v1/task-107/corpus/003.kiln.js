project("passnet").program(({v0, v1}) => {
const v2 = N.conv2d(v0, v1, null, {"stride": [2, 2], "padding": [3, 3], "dilation": [1, 1], "groups": 1});
const v3 = N.maxPool2d(v2, {"kernel_size": [3, 3], "stride": [2, 2], "padding": [1, 1], "dilation": [1, 1], "ceil_mode": false, "return_indices": false});
return {out0: v3};
}, {v0: k.tensor([1, 3, 384, 384], "f16"), v1: k.tensor([64, 3, 7, 7], "f16")});
