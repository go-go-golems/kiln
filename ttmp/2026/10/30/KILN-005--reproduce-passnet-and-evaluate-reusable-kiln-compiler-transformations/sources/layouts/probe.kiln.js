project("passnet").program(({v0}) => {
const v1 = N.transpose(v0, 1, 2);
const v2 = N.reshape(v1, [2, 4, 3]);
const v3 = N.reshape(v2, [2, 12]);
const v4 = N.cast(v3, "f16");
const v5 = N.cast(v4, "f32");
const v6 = N.cast(v3, "bf16");
const v7 = N.cast(v6, "f32");
const v8 = N.reshape(v0, [2, 12]);
const v9 = N.reshape(v0, [6, 4]);
return {out0: v5, out1: v7, out2: v8, out3: v9};
}, {v0: k.tensor([2, 3, 4], "f32")});
