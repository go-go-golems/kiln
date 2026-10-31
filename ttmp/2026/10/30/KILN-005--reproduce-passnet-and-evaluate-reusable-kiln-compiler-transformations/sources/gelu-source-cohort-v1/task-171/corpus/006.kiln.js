project("passnet").program(({v0, v1}) => {
const v2 = N.cast(N.gelu(N.cast(v0, "f32"), "none"), "bf16");
const v3 = N.mul(v2, v1);
const v4 = v3;
return {out0: v4};
}, {v0: k.tensor([1, 11, 2048], "bf16"), v1: k.tensor([1, 11, 2048], "bf16")});
