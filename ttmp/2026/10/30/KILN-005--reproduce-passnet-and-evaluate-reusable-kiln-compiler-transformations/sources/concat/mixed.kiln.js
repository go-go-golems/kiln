project("passnet").program(({v0, v1, v2}) => {
const v3 = N.concat([N.cast(v0, "f32"), N.cast(v1, "f32"), N.cast(v2, "f32")], -1);
const v4 = N.transpose(v0, 0, 1);
const v5 = N.transpose(v1, 0, 1);
const v6 = N.transpose(v2, 0, 1);
const v7 = N.concat([N.cast(v4, "f32"), N.cast(v5, "f32"), N.cast(v6, "f32")], 0);
const v8 = N.concat([N.cast(v0, "f32"), N.cast(v1, "f32"), N.cast(v2, "f32")], -1);
const v9 = N.reshape(N.slice(v8, 1, 1, 5), [2, 4]);
return {out0: v3, out1: v7, out2: v9};
}, {v0: k.tensor([2, 1], "f16"), v1: k.tensor([2, 2], "bf16"), v2: k.tensor([2, 3], "f16")});
