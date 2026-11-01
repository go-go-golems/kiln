project("passnet").program(({v0, v1, v2, v3, v4}) => {
const v5 = N.expect(N.conv2d(v0, v1, v2, {"stride": [1, 1], "padding": [0, 0], "dilation": [1, 1], "groups": 1}), [8, 21, 64, 64], "bf16");
const v6 = N.expect(N.add(v3, v4), [8, 512, 64, 64], "bf16");
const v7 = N.expect(v6, [8, 512, 64, 64], "bf16");
return {out0: v7, out1: v5};
}, {v0: k.tensor([8, 512, 64, 64], "bf16"), v1: k.tensor([21, 512, 1, 1], "bf16"), v2: k.tensor([21], "bf16"), v3: k.tensor([8, 512, 64, 64], "bf16"), v4: k.tensor([8, 512, 64, 64], "bf16")});
