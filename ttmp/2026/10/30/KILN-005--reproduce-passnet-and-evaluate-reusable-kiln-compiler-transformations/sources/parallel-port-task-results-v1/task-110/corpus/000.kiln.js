project("passnet").program(({v0, v1, v2, v3, v4, v5, v6}) => {
const v7 = N.conv2d(v0, v1, v2, {"stride": [1, 1], "padding": [3, 3], "dilation": [1, 1], "groups": 57});
const v8 = N.concat([v3, v4, v7], 1);
const v9 = N.reshape(v8, [1, 8, 19, 196]);
const v10 = N.transpose(v9, 3, 2);
const v11 = N.mul(v5, v10);
const v12 = N.pad(v11, [0, 0, 1, 0, 0, 0], "constant", 0);
const v13 = N.mul(0.22941573387056177, v6);
const v14 = N.add(v13, v12);
const v15 = N.transpose(v14, 1, 2);
const v16 = N.reshape(v15, [1, 197, 152]);
return {out0: v16};
}, {v0: k.tensor([1, 57, 14, 14], "bf16"), v1: k.tensor([57, 1, 7, 7], "bf16"), v2: k.tensor([57], "bf16"), v3: k.tensor([1, 38, 14, 14], "bf16"), v4: k.tensor([1, 57, 14, 14], "bf16"), v5: k.tensor([1, 8, 196, 19], "bf16"), v6: k.tensor([1, 8, 197, 19], "bf16")});
