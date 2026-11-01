project("passnet").program(({v0, v1}) => {
const v2 = N.expect(N.add(v0, v1), [1, 16, 13, 13], "f16");
const v3 = N.expect(N.full([], -3.4028234663852886e+38, "f32"), [], "f32");
const v4 = N.expect(N.max(v2, v3), [1, 16, 13, 13], "f16");
const v5 = N.expect(N.reshape(v4, [16, 13, 13]), [16, 13, 13], "f16");
const v6 = N.expect(N.cast(N.softmax(N.cast(v5, "f32"), 2), "f16"), [16, 13, 13], "f16");
const v7 = N.expect(v6, [16, 13, 13], "f16");
return {out0: v7};
}, {v0: k.tensor([1, 16, 13, 13], "f16"), v1: k.tensor([1, 1, 13, 13], "f16")});
