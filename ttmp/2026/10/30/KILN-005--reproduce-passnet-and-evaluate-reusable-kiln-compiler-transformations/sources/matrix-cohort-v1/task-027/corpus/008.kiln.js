project("passnet").program(({v0, v1, v2}) => {
const v3 = N.cast(N.linear(N.cast(v0, "f32"), N.cast(v1, "f32"), null), "bf16");
const v4 = N.mul(v2, v3);
return {out0: v4};
}, {v0: k.tensor([4, 512, 2048], "bf16"), v1: k.tensor([11008, 2048], "bf16"), v2: k.tensor([4, 512, 11008], "bf16")});
