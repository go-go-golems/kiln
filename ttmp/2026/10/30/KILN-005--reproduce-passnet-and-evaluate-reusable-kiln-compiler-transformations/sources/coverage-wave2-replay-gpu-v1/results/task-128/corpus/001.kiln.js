project("passnet").program(({v0, v1, v2}) => {
const v3 = N.expect(N.conv2d(v0, v1, v2, {"stride": [1, 1], "padding": [0, 0], "dilation": [1, 1], "groups": 1}), [1, 150, 128, 128], "bf16");
const v4 = N.expect(N.resizeBilinear(v3, [512, 512]), [1, 150, 512, 512], "bf16");
return {out0: v4};
}, {v0: k.tensor([1, 512, 128, 128], "bf16"), v1: k.tensor([150, 512, 1, 1], "bf16"), v2: k.tensor([150], "bf16")});
