project("passnet").program(({v0}) => {
const v1 = N.reshape(v0, [1, 2, 1, 3, 1]);
const v2 = N.reshape(v0, [2, 1, 3, 1, 1]);
const v3 = N.reshape(v0, [2, 3]);
const v4 = N.reshape(v0, [2, 3]);
const v5 = N.reshape(v0, [2, 1, 3, 1]);
const v6 = N.transpose(v0, 0, 3);
const v7 = N.reshape(v6, [1, 1, 1, 3, 2]);
return {out0: v1, out1: v2, out2: v3, out3: v4, out4: v5, out5: v7};
}, {v0: k.tensor([2, 1, 3, 1], "f16")});
