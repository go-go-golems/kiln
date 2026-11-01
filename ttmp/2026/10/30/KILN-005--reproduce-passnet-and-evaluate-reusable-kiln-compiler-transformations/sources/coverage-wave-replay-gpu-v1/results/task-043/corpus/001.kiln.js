project("passnet").program(({v0, v1}) => {
const v2 = N.expect(N.add(v0, v1), [1, 12, 9, 9], "bf16");
const v3 = N.expect(N.full([], -3.4028234663852886e+38, "f32"), [], "f32");
const v4 = N.expect(N.max(v2, v3), [1, 12, 9, 9], "bf16");
const v5 = N.expect(N.reshape(v4, [12, 9, 9]), [12, 9, 9], "bf16");
const v6 = N.expect(N.cast(N.softmax(N.cast(v5, "f32"), 2), "bf16"), [12, 9, 9], "bf16");
const v7 = N.expect(v6, [12, 9, 9], "bf16");
return {out0: v7};
}, {v0: k.tensor([1, 12, 9, 9], "bf16"), v1: k.tensor([1, 1, 9, 9], "bf16")});
