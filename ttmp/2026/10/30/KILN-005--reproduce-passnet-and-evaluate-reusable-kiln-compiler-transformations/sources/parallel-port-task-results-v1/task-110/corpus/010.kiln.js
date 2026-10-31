project("passnet").program(({v0, v1, v2, v3, v4, v5, v6}) => {
const v7 = N.conv2d(v0, v1, v2, {"stride": [1, 1], "padding": [3, 3], "dilation": [1, 1], "groups": 96});
const v8 = N.concat([v3, v4, v7], 1);
const v9 = N.reshape(v8, [1, 8, 32, 2304]);
const v10 = N.transpose(v9, 3, 2);
const v11 = N.mul(v5, v10);
const v12 = N.pad(v11, [0, 0, 1, 0, 0, 0], "constant", 0);
const v13 = N.mul(0.1767766952966369, v6);
const v14 = N.add(v13, v12);
const v15 = N.transpose(v14, 1, 2);
const v16 = N.reshape(v15, [1, 2305, 256]);
return {out0: v16};
}, {v0: k.tensor([1, 96, 48, 48], "f16"), v1: k.tensor([96, 1, 7, 7], "f16"), v2: k.tensor([96], "f16"), v3: k.tensor([1, 64, 48, 48], "f16"), v4: k.tensor([1, 96, 48, 48], "f16"), v5: k.tensor([1, 8, 2304, 32], "f16"), v6: k.tensor([1, 8, 2305, 32], "f16")});
