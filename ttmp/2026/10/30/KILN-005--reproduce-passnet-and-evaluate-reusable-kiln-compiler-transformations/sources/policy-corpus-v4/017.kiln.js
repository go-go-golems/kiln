project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.concat([v0, v1], 3);
const v5 = N.reshape(v4, [1, 625, 512]);
const v6 = N.mul(v2, 0.125);
const v7 = N.reshape(v5, [1, 625, 8, 64]);
const v8 = N.transpose(v7, 1, 2);
const v9 = N.reshape(v8, [1, 8, 625, 64]);
const v10 = N.reshape(v3, [1, 625, 8, 32]);
const v11 = N.transpose(v10, 1, 2);
return {out0: v9, out1: v6, out2: v11};
}, {v0: k.tensor([1, 625, 8, 32], "f32"), v1: k.tensor([1, 625, 8, 32], "f32"), v2: k.tensor([1, 300, 512], "f32"), v3: k.tensor([1, 625, 256], "f32")});
