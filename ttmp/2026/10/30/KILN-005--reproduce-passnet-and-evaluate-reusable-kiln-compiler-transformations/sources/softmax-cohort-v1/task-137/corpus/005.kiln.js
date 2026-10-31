project("passnet").program(({v0, v1}) => {
const v2 = N.cast(N.softmax(N.cast(v0, "f32"), 1), "f16");
const v3 = N.reshape(v2, [2, 256]);
const v4 = N.reshape(v3, [2, 256, 1, 1]);
const v5 = N.reshape(v4, [2, 2, 128, 1, 1]);
const v6 = N.mul(v5, v1);
const v7 = N.cast(N.reshape(N.sum(N.cast(v6, "f32"), 1, true), [2, 128, 128, 128]), "f16");
const v8 = N.reshape(v7, [2, 128, 128, 128]);
return {out0: v8};
}, {v0: k.tensor([2, 2, 1, 128], "f16"), v1: k.tensor([2, 2, 128, 128, 128], "f16")});
