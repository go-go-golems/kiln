project("passnet").program(({v0, v1, v2}) => {
const v3 = N.cast(N.linear(N.cast(v0, "f32"), N.cast(v1, "f32"), N.cast(v2, "f32")), "f16");
return {out0: v3};
}, {v0: k.tensor([5, 17], "f16"), v1: k.tensor([7, 17], "f16"), v2: k.tensor([7], "f16")});
