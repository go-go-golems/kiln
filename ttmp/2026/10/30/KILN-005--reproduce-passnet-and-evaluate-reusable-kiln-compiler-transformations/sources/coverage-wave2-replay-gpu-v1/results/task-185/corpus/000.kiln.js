project("passnet").program(({v0, v1, v2}) => {
const v3 = N.expect(N.cast(N.linear(N.cast(v0, "f32"), N.cast(v1, "f32"), N.cast(v2, "f32")), "f16"), [1, 249, 768], "f16");
const v4 = N.expect(v3, [1, 249, 768], "f16");
const v5 = N.expect(N.transpose(v4, 1, 2), [1, 768, 249], "f16");
return {out0: v4, out1: v5};
}, {v0: k.tensor([1, 249, 512], "f16"), v1: k.tensor([768, 512], "f16"), v2: k.tensor([768], "f16")});
