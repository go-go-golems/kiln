project("passnet").program(({v0, v1, v2}) => {
const v3 = N.expect(N.conv2d(v0, v1, null, {"stride": [1, 1], "padding": [32, 0], "dilation": [1, 1], "groups": 4}), [1, 4, 64, 8], "bf16");
const v4 = N.expect(N.add(v2, v3), [1, 4, 64, 8], "bf16");
const v5 = N.expect(N.transpose(v4, 1, 2), [1, 64, 4, 8], "bf16");
const v6 = N.expect(N.reshape(v5, [1, 64, 4, 8]), [1, 64, 4, 8], "bf16");
const v7 = N.expect(N.reshape(v6, [1, 64, 32]), [1, 64, 32], "bf16");
return {out0: v7, __mut2: v4};
}, {v0: k.tensor([1, 4, 64, 8], "bf16"), v1: k.tensor([4, 1, 65, 1], "bf16"), v2: k.tensor([1, 4, 64, 8], "bf16")});
