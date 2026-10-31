project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.cast(N.linear(N.cast(v0, "f32"), N.cast(v1, "f32"), N.cast(v2, "f32")), "bf16");
const v5 = N.cast(N.sigmoid(N.cast(v4, "f32")), "bf16");
const v6 = N.reshape(v5, [1, 64, 1, 1]);
const v7 = N.mul(v3, v6);
return {out0: v7};
}, {v0: k.tensor([1, 8], "bf16"), v1: k.tensor([64, 8], "bf16"), v2: k.tensor([64], "bf16"), v3: k.tensor([1, 64, 96, 96], "bf16")});
