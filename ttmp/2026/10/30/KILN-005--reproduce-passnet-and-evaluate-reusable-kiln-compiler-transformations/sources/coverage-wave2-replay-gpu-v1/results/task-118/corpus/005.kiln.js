project("passnet").program(({v0, v1, v2}) => {
const v3 = N.expect(N.cast(N.linear(N.cast(v0, "f32"), N.cast(v1, "f32"), N.cast(v2, "f32")), "f16"), [64, 256, 768], "f16");
const v4 = N.expect(N.transpose(v3, 1, 2), [64, 768, 256], "f16");
const v5 = N.expect(N.reshape(v4, [64, 768, 16, 16]), [64, 768, 16, 16], "f16");
const v6 = N.expect(N.resizeBilinear(v5, [128, 128]), [64, 768, 128, 128], "f16");
return {out0: v6};
}, {v0: k.tensor([64, 256, 512], "f16"), v1: k.tensor([768, 512], "f16"), v2: k.tensor([768], "f16")});
