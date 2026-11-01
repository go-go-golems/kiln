project("passnet").program(({v0, v1}) => {
const v2 = N.expect(N.add(v0, v1), [1, 16, 8, 8], "f16");
const v3 = N.expect(N.cast(v2, "f32"), [1, 16, 8, 8], "f32");
const v4 = N.expect(N.cast(N.softmax(N.cast(v3, "f32"), 3), "f32"), [1, 16, 8, 8], "f32");
const v5 = N.expect(N.cast(v4, "f16"), [1, 16, 8, 8], "f16");
const v6 = N.expect(v5, [1, 16, 8, 8], "f16");
return {out0: v6, __mut0: v2};
}, {v0: k.tensor([1, 16, 8, 8], "f16"), v1: k.tensor([1, 16, 8, 8], "f16")});
