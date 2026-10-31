project("passnet").program(({v0, v1}) => {
const v2 = N.cast(N.linear(N.cast(v0, "f32"), N.cast(v1, "f32"), null), "bf16");
return {out0: v2};
}, {v0: k.tensor([2, 5, 17], "bf16"), v1: k.tensor([17], "bf16")});
