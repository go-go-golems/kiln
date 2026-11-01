project("passnet").program(({v0}) => {
const v1 = N.expect(N.full([], 256, "f32"), [], "f32");
const v2 = N.expect(N.full([], 0.5, "f32"), [], "f32");
const v3 = N.expect(N.cast(N.pow(N.cast(v1, "f32"), N.cast(v2, "f32")), "f32"), [], "f32");
const v4 = N.expect(N.div(v0, v3), [2, 4096, 4096], "bf16");
const v5 = N.expect(N.full([], 0.05, "f32"), [], "f32");
const v6 = N.expect(N.div(v4, v5), [2, 4096, 4096], "bf16");
const v7 = N.expect(N.cast(N.softmax(N.cast(v6, "f32"), 2), "bf16"), [2, 4096, 4096], "bf16");
return {out0: v7, __mut0: v6};
}, {v0: k.tensor([2, 4096, 4096], "bf16")});
