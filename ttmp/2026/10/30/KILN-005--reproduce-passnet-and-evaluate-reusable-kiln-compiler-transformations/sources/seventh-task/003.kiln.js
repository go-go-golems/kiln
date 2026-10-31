project("passnet").program(({v0, v1, v2}) => {
const v3 = v2;
const v4 = N.cast(v3, "bf16");
const v5 = N.cast(N.linear(N.cast(v4, "f32"), N.cast(v1, "f32"), N.cast(v0, "f32")), "bf16");
return {out0: v5};
}, {v0: k.tensor([128], "bf16"), v1: k.tensor([128, 128], "bf16"), v2: k.tensor([128, 128], "bf16")});
