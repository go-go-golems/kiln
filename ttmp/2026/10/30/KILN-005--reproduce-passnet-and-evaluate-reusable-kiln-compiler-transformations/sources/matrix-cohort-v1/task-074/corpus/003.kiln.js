project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.cast(N.linear(N.cast(v0, "f32"), N.cast(v1, "f32"), N.cast(v2, "f32")), "f32");
const v5 = N.cast(N.sigmoid(N.cast(v4, "f32")), "f32");
const v6 = N.reshape(v5, [128, 64, 1, 1]);
const v7 = N.mul(v3, v6);
return {out0: v7};
}, {v0: k.tensor([128, 8], "f32"), v1: k.tensor([64, 8], "f32"), v2: k.tensor([64], "f32"), v3: k.tensor([128, 64, 64, 64], "f32")});
