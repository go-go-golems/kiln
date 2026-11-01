project("passnet").program(({v0, v1}) => {
const v2 = N.expect(N.add(v0, v1), [1, 16, 9, 9], "f32");
const v3 = N.expect(N.full([], -3.4028234663852886e+38, "f32"), [], "f32");
const v4 = N.expect(N.max(v2, v3), [1, 16, 9, 9], "f32");
const v5 = N.expect(N.reshape(v4, [16, 9, 9]), [16, 9, 9], "f32");
const v6 = N.expect(N.cast(N.softmax(N.cast(v5, "f32"), 2), "f32"), [16, 9, 9], "f32");
const v7 = N.expect(v6, [16, 9, 9], "f32");
return {out0: v7};
}, {v0: k.tensor([1, 16, 9, 9], "f32"), v1: k.tensor([1, 1, 9, 9], "f32")});
