project("passnet").program(({v0, v1, v2}) => {
const v3 = N.expect(v0, [128, 128], "f16");
const v4 = N.expect(N.cast(v3, "f16"), [128, 128], "f16");
const v5 = N.expect(N.cast(N.linear(N.cast(v4, "f32"), N.cast(v1, "f32"), N.cast(v2, "f32")), "f16"), [128, 128], "f16");
return {out0: v5};
}, {v0: k.tensor([128, 128], "f16"), v1: k.tensor([128, 128], "f16"), v2: k.tensor([128], "f16")});
