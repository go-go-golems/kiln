project("passnet").program(({v0}) => {
const v1 = N.cast(N.gelu(N.cast(v0, "f32"), "none"), "f16");
const v2 = N.cast(N.gelu(N.cast(v0, "f32"), "tanh"), "f16");
const v3 = N.add(v1, 1);
return {out0: v1, out1: v2, out2: v3};
}, {v0: k.tensor([16, 256], "f16")});
