project("passnet").program(({v0, v1, v2}) => {
const v3 = N.expect(N.cast(N.sqrt(N.sum(N.mul(N.cast(v0, "f32"), N.cast(v0, "f32")), 1, true)), "f16"), [1, 1], "f16");
const v4 = N.expect(N.div(v0, v3), [1, 512], "f16");
const v5 = N.expect(N.cast(N.sqrt(N.sum(N.mul(N.cast(v1, "f32"), N.cast(v1, "f32")), 2, true)), "f16"), [1, 1, 1], "f16");
const v6 = N.expect(N.div(v1, v5), [1, 1, 512], "f16");
const v7 = N.expect(N.exp(v2), [], "f16");
const v8 = N.expect(N.mul(v7, v6), [1, 1, 512], "f16");
return {out0: v8, out1: v6, out2: v4};
}, {v0: k.tensor([1, 512], "f16"), v1: k.tensor([1, 1, 512], "f16"), v2: k.tensor([], "f16")});
