project("passnet").program(({v0, v1}) => {
const v2 = N.cast(N.sigmoid(N.cast(v0, "f32")), "f16");
const v3 = N.cast(N.silu(N.cast(v0, "f32")), "f16");
const v4 = N.mul(v2, v1);
return {out0: v3, out1: v2, out2: v4};
}, {v0: k.tensor([16, 256], "f16"), v1: k.tensor([16, 256], "f16")});
