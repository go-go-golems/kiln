project("passnet").program(({v0}) => {
const v1 = N.expect(N.cast(N.select(N.gt(N.select(N.lt(N.cast(v0, "f32"), N.cast(N.cast(N.const(0.0, []), "f32"), "f32")), N.cast(N.cast(N.const(0.0, []), "f32"), "f32"), N.cast(v0, "f32")), N.cast(N.cast(N.const(6.0, []), "f32"), "f32")), N.cast(N.cast(N.const(6.0, []), "f32"), "f32"), N.select(N.lt(N.cast(v0, "f32"), N.cast(N.cast(N.const(0.0, []), "f32"), "f32")), N.cast(N.cast(N.const(0.0, []), "f32"), "f32"), N.cast(v0, "f32"))), "f32"), [1, 1280, 8, 6], "f32");
const v2 = N.expect(N.adaptiveAvgPool2d(v1, [1, 1]), [1, 1280, 1, 1], "f32");
const v3 = N.expect(N.reshape(v2, [1, 1280]), [1, 1280], "f32");
const v4 = N.expect(N.reshape(v3, [1, 1280]), [1, 1280], "f32");
return {out0: v4, __mut0: v1};
}, {v0: k.tensor([1, 1280, 8, 6], "f32")});
