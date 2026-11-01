project("passnet").program(({v0, v1, v2}) => {
const v3 = N.expect(N.cast(N.linear(N.cast(v0, "f32"), N.cast(v1, "f32"), N.cast(v2, "f32")), "bf16"), [12, 256, 768], "bf16");
const v4 = N.expect(N.transpose(v3, 1, 2), [12, 768, 256], "bf16");
const v5 = N.expect(N.reshape(v4, [12, 768, 16, 16]), [12, 768, 16, 16], "bf16");
const v6 = N.expect(N.resizeBilinear(v5, [128, 128]), [12, 768, 128, 128], "bf16");
return {out0: v6};
}, {v0: k.tensor([12, 256, 512], "bf16"), v1: k.tensor([768, 512], "bf16"), v2: k.tensor([768], "bf16")});
