project("passnet").program(({v0, v1, v2}) => {
const v3 = N.expect(N.conv2d(v0, v1, null, {"stride": [1, 1], "padding": [32, 0], "dilation": [1, 1], "groups": 12}), [1, 12, 16, 64], "bf16");
const v4 = N.expect(N.add(v2, v3), [1, 12, 16, 64], "bf16");
const v5 = N.expect(N.transpose(v4, 1, 2), [1, 16, 12, 64], "bf16");
const v6 = N.expect(N.reshape(v5, [1, 16, 12, 64]), [1, 16, 12, 64], "bf16");
const v7 = N.expect(N.reshape(v6, [1, 16, 768]), [1, 16, 768], "bf16");
return {out0: v7, __mut2: v4};
}, {v0: k.tensor([1, 12, 16, 64], "bf16"), v1: k.tensor([12, 1, 65, 1], "bf16"), v2: k.tensor([1, 12, 16, 64], "bf16")});
