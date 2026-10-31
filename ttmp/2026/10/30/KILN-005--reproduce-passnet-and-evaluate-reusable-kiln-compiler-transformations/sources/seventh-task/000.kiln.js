project("passnet").program(({v0, v1, v2}) => {
const v3 = v2;
const v4 = N.cast(N.linear(N.cast(v3, "f32"), N.cast(v1, "f32"), N.cast(v0, "f32")), "bf16");
return {out0: v4};
}, {v0: k.tensor([3072], "bf16"), v1: k.tensor([3072, 768], "bf16"), v2: k.tensor([1, 17, 768], "bf16")});
