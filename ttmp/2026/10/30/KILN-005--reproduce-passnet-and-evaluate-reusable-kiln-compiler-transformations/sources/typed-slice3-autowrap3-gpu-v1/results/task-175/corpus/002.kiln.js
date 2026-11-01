project("passnet").program(({v0, v1, v2}) => {
const v3 = N.expect(N.cast(N.silu(N.cast(v0, "f32")), "f32"), [1, 512, 20, 20], "f32");
const v4 = N.expect(v1, [1, 256, 80, 80], "f32");
const v5 = N.expect(v2, [1, 512, 40, 40], "f32");
const v6 = N.expect(v3, [1, 512, 20, 20], "f32");
return {out0: v4, out1: v5, out2: v6, __mut0: v3};
}, {v0: k.tensor([1, 512, 20, 20], "f32"), v1: k.tensor([1, 256, 80, 80], "f32"), v2: k.tensor([1, 512, 40, 40], "f32")});
