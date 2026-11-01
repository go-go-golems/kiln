project("passnet").program(({v0, v1}) => {
const v2 = N.expect(N.cast(N.matmul(N.cast(v0, "f32"), N.cast(v1, "f32")), "f32"), [4, 1, 608, 1], "f32");
const v3 = N.expect(N.reshape(v2, [4, 608, 1, 1]), [4, 608, 1, 1], "f32");
return {out0: v3};
}, {v0: k.tensor([4, 1, 608, 48], "f32"), v1: k.tensor([4, 1, 48, 1], "f32")});
