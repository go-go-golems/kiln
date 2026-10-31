project("passnet").program(({v0, v1}) => {
const v2 = N.mul(v0, v1);
const v3 = N.cast(N.reshape(N.sum(N.cast(v2, "f32"), 1, true), [24, 64, 64]), "bf16");
const v4 = N.reshape(v3, [24, 1, 64, 64]);
const v5 = N.cast(N.sigmoid(N.cast(v4, "f32")), "bf16");
return {out0: v5};
}, {v0: k.tensor([24, 64, 64, 64], "bf16"), v1: k.tensor([24, 64, 64, 64], "bf16")});
