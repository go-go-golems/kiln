project("passnet").program(({v0}) => {
const v1 = N.expect(N.cast(v0, "f32"), [1, 1, 22, 22], "f32");
const v2 = N.expect(N.sub(1.0, v1), [1, 1, 22, 22], "f32");
const v3 = N.expect(N.cast(v2, "bool"), [1, 1, 22, 22], "bool");
const v4 = N.expect(N.maskedFill(v2, v3, -3.4028234663852886e+38), [1, 1, 22, 22], "f32");
const v5 = N.expect(N.mul(v4, v2), [1, 1, 22, 22], "f32");
return {out0: v5};
}, {v0: k.tensor([1, 1, 22, 22], "i64")});
