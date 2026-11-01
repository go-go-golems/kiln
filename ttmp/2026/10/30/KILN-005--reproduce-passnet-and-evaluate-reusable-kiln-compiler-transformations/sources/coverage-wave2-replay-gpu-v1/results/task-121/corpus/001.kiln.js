project("passnet").program(({v0, v1, v2}) => {
const v3 = N.expect(v0, [1, 17, 768], "f16");
const v4 = N.expect(N.cast(N.linear(N.cast(v3, "f32"), N.cast(v1, "f32"), N.cast(v2, "f32")), "f16"), [1, 17, 3072], "f16");
return {out0: v4};
}, {v0: k.tensor([1, 17, 768], "f16"), v1: k.tensor([3072, 768], "f16"), v2: k.tensor([3072], "f16")});
