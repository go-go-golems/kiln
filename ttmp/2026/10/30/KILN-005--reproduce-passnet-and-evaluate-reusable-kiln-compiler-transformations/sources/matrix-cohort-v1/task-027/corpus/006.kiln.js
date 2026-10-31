project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.cast(N.linear(N.cast(v0, "f32"), N.cast(v1, "f32"), null), "f16");
const v5 = N.mul(v2, v3);
return {out0: v5, out1: v4};
}, {v0: k.tensor([64, 17, 512], "f16"), v1: k.tensor([256, 512], "f16"), v2: k.tensor([64, 17, 256], "f16"), v3: k.tensor([256], "f16")});
