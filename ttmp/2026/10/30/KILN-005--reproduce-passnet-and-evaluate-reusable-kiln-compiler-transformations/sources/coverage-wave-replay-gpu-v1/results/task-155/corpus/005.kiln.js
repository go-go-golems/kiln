project("passnet").program(({v0, v1, v2, v3, v4, v5}) => {
const v6 = N.expect(N.cast(v0, "f32"), [1, 1, 11, 11], "f32");
const v7 = N.expect(N.full([], 1.0, "f32"), [], "f32");
const v8 = N.expect(N.sub(v7, v6), [1, 1, 11, 11], "f32");
const v9 = N.expect(N.cast(v8, "bool"), [1, 1, 11, 11], "bool");
const v10 = N.expect(N.maskedFill(v8, v9, -3.4028234663852886e+38), [1, 1, 11, 11], "f32");
const v11 = N.expect(N.reshape(v1, [1, 11]), [1, 11], "i64");
const v12 = N.expect(N.add(v11, N.int(2)), [1, 11], "i64");
const v13 = N.expect(N.embedding(v12, v2), [1, 11, 768], "bf16");
const v14 = N.expect(v13, [1, 11, 768], "bf16");
const v15 = N.expect(N.add(v3, v14), [1, 11, 768], "bf16");
const v16 = N.expect(N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v15, "f32"), [11, 768]), N.reshape(N.cast(v4, "f32"), [768]), N.reshape(N.cast(v5, "f32"), [768]), {"eps": 1e-05}), [1, 11, 768]), "bf16"), [1, 11, 768], "bf16");
const v17 = N.expect(v16, [1, 11, 768], "bf16");
return {out0: v10, out1: v17};
}, {v0: k.tensor([1, 1, 11, 11], "i64"), v1: k.tensor([11], "i64"), v2: k.tensor([1026, 768], "bf16"), v3: k.tensor([1, 11, 768], "bf16"), v4: k.tensor([768], "bf16"), v5: k.tensor([768], "bf16")});
