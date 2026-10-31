project("passnet").program(({v0, v1}) => {
const v2 = N.conv2d(v1, v0, null, {"stride": [1, 1], "padding": [0, 0], "dilation": [1, 1], "groups": 1});
const v3 = N.avgPool2d(v2, {"kernel_size": [2, 2], "stride": [2, 2], "padding": [0, 0], "ceil_mode": false, "count_include_pad": true, "divisor_override": null});
return {out0: v3};
}, {v0: k.tensor([256, 512, 1, 1], "f32"), v1: k.tensor([1, 512, 32, 32], "f32")});
