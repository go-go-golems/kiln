project("passnet").program(({v0, v1, v2}) => {
const v3 = N.cast(N.linear(N.cast(v0, "f32"), N.cast(v1, "f32"), N.cast(v2, "f32")), "bf16");
return {out0: v3};
}, {v0: k.tensor([2, 5, 17], "bf16"), v1: k.tensor([7, 17], "bf16"), v2: k.tensor([7], "bf16")});
