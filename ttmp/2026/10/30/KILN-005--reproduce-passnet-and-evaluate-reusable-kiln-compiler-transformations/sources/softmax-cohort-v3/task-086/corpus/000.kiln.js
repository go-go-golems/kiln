project("passnet").program(({v0, v1}) => {
const v2 = N.cast(N.softmax(N.cast(v0, "f32"), 1), "bf16");
const v3 = N.mul(v1, v2);
const v4 = N.cast(N.reshape(N.sum(N.cast(v3, "f32"), 1, true), [1, 256, 14, 14]), "bf16");
return {out0: v4};
}, {v0: k.tensor([1, 2, 256, 1, 1], "bf16"), v1: k.tensor([1, 2, 256, 14, 14], "bf16")});
