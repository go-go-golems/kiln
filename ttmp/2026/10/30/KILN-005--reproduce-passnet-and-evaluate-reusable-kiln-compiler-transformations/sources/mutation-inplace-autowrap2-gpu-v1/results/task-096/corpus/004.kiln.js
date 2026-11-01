project("passnet").program(({v0, v1}) => {
const v2 = N.expect(N.cast(N.silu(N.cast(v0, "f32")), "f32"), [4, 128, 16, 16], "f32");
const v3 = N.expect(N.add(v2, v1), [4, 128, 16, 16], "f32");
return {out0: v3, __mut0: v2};
}, {v0: k.tensor([4, 128, 16, 16], "f32"), v1: k.tensor([4, 128, 16, 16], "f32")});
