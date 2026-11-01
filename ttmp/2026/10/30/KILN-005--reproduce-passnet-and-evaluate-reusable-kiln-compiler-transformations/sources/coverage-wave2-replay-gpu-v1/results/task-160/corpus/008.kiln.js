project("passnet").program(({v0, v1}) => {
const v2 = N.expect(N.cast(N.matmul(N.cast(v0, "f32"), N.cast(v1, "f32")), "f32"), [8, 1, 304, 1], "f32");
const v3 = N.expect(N.reshape(v2, [8, 304, 1, 1]), [8, 304, 1, 1], "f32");
return {out0: v3};
}, {v0: k.tensor([8, 1, 304, 192], "f32"), v1: k.tensor([8, 1, 192, 1], "f32")});
