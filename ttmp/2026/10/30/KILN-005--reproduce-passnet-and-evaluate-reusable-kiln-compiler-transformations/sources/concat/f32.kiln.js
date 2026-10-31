project("passnet").program(({v0, v1, v2}) => {
const v3 = N.concat([v0, v1, v2], -1);
const v4 = N.transpose(v0, 0, 1);
const v5 = N.transpose(v1, 0, 1);
const v6 = N.transpose(v2, 0, 1);
const v7 = N.concat([v4, v5, v6], 0);
const v8 = N.concat([v0, v1, v2], -1);
const v9 = N.reshape(N.slice(v8, 1, 1, 5), [2, 4]);
return {out0: v3, out1: v7, out2: v9};
}, {v0: k.tensor([2, 1], "f32"), v1: k.tensor([2, 2], "f32"), v2: k.tensor([2, 3], "f32")});
