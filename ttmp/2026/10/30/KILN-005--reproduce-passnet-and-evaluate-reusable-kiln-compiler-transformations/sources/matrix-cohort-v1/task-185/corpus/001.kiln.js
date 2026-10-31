project("passnet").program(({v0, v1, v2}) => {
const v3 = N.cast(N.linear(N.cast(v0, "f32"), N.cast(v1, "f32"), N.cast(v2, "f32")), "bf16");
const v4 = v3;
const v5 = N.transpose(v4, 1, 2);
return {out0: v4, out1: v5};
}, {v0: k.tensor([1, 249, 512], "bf16"), v1: k.tensor([1024, 512], "bf16"), v2: k.tensor([1024], "bf16")});
