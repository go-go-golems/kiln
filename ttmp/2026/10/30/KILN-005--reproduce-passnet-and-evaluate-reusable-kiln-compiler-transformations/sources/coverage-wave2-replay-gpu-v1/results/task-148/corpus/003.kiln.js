project("passnet").program(({v0, v1, v2}) => {
const v3 = N.expect(N.conv2d(v0, v1, v2, {"stride": [1, 1], "padding": [0, 0], "dilation": [1, 1], "groups": 1}), [512, 17, 64, 48], "bf16");
const v4 = N.expect(N.reshape(v3, [512, 17, 3072]), [512, 17, 3072], "bf16");
return {out0: v4};
}, {v0: k.tensor([512, 160, 64, 48], "bf16"), v1: k.tensor([17, 160, 1, 1], "bf16"), v2: k.tensor([17], "bf16")});
