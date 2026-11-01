project("passnet").program(({v0}) => {
const v1 = N.expect(N.cast(N.softmax(N.cast(v0, "f32"), 1), "bf16"), [1, 5], "bf16");
const v2 = N.expect(N.select(N.lt(N.arange(0, 5, 1, "i64"), N.int(2)), N.add(N.mul(N.cast(N.arange(0, 5, 1, "i64"), "f32"), 1.0), 0.0), N.sub(4.0, N.mul(N.sub(4.0, N.cast(N.arange(0, 5, 1, "i64"), "f32")), 1.0))), [5], "f32");
const v3 = N.expect(N.mul(v1, v2), [1, 5], "f32");
const v4 = N.expect(N.cast(N.reshape(N.sum(N.cast(v3, "f32"), 1, true), [1]), "f32"), [1], "f32");
const v5 = N.expect(N.sub(N.int(5), v4), [1], "f32");
return {out0: v5};
}, {v0: k.tensor([1, 5], "bf16")});
