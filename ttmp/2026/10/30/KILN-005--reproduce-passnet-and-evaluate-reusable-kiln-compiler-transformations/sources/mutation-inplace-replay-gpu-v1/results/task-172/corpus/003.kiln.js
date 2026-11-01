project("passnet").program(({v0, v1}) => {
const v2 = N.expect(N.add(v0, v1), [2, 16, 64, 64], "f32");
const v3 = N.expect(N.cast(v2, "f32"), [2, 16, 64, 64], "f32");
const v4 = N.expect(N.cast(N.softmax(N.cast(v3, "f32"), 3), "f32"), [2, 16, 64, 64], "f32");
const v5 = N.expect(N.cast(v4, "f32"), [2, 16, 64, 64], "f32");
const v6 = N.expect(v5, [2, 16, 64, 64], "f32");
return {out0: v6, __mut0: v2};
}, {v0: k.tensor([2, 16, 64, 64], "f32"), v1: k.tensor([2, 16, 64, 64], "f32")});
