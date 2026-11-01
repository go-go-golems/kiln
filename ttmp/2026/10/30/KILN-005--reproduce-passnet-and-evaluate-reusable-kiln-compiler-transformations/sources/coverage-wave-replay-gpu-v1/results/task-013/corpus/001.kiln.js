project("passnet").program(({v0, v1, v2, v3, v4}) => {
const v5 = N.expect(N.eq(v0, N.int(1)), [1, 15], "bool");
const v6 = N.expect(N.cast(v5, "f32"), [1, 15], "f32");
const v7 = N.expect(N.mul(v6, -3.4028234663852886e+38), [1, 15], "f32");
const v8 = N.expect(N.reshape(v7, [1, 1, 15]), [1, 1, 15], "f32");
const v9 = N.expect(N.reshape(v8, [1, 1, 1, 15]), [1, 1, 1, 15], "f32");
const v10 = N.expect(N.embedding(v0, v1), [1, 15, 32], "f16");
const v11 = N.expect(N.full([1, 15], 1, "i64"), [1, 15], "i64");
const v12 = N.expect(N.cumsum(v11, 1), [1, 15], "i64");
const v13 = N.expect(N.sub(v12, v11), [1, 15], "i64");
const v14 = N.expect(N.add(v13, N.int(2)), [1, 15], "i64");
const v15 = N.expect(N.embedding(v14, v2), [1, 15, 32], "f16");
const v16 = N.expect(N.add(v10, v15), [1, 15, 32], "f16");
const v17 = N.expect(N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v16, "f32"), [15, 32]), N.reshape(N.cast(v3, "f32"), [32]), N.reshape(N.cast(v4, "f32"), [32]), {"eps": 1e-05}), [1, 15, 32]), "f16"), [1, 15, 32], "f16");
const v18 = N.expect(v17, [1, 15, 32], "f16");
return {out0: v18, out1: v9};
}, {v0: k.tensor([1, 15], "i64"), v1: k.tensor([250002, 32], "f16"), v2: k.tensor([512, 32], "f16"), v3: k.tensor([32], "f16"), v4: k.tensor([32], "f16")});
