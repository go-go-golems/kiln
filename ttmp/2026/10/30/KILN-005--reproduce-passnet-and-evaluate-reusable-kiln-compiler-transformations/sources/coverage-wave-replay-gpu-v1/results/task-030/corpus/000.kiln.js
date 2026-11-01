project("passnet").program(({v0, v1, v2, v3, v4}) => {
const v5 = N.expect(N.embedding(v0, v1), [1, 1, 256], "bf16");
const v6 = N.expect(N.mul(v5, 16.0), [1, 1, 256], "bf16");
const v7 = N.expect(N.arange(0, 1, 1, "i64"), [1], "i64");
const v8 = N.expect(N.expand(v7, [1, -1]), [1, 1], "i64");
const v9 = N.expect(N.add(v8, N.int(2)), [1, 1], "i64");
const v10 = N.expect(N.embedding(v9, v2), [1, 1, 256], "bf16");
const v11 = N.expect(N.add(v6, v10), [1, 1, 256], "bf16");
const v12 = N.expect(N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v11, "f32"), [1, 256]), N.reshape(N.cast(v3, "f32"), [256]), N.reshape(N.cast(v4, "f32"), [256]), {"eps": 1e-05}), [1, 1, 256]), "bf16"), [1, 1, 256], "bf16");
const v13 = N.expect(v12, [1, 1, 256], "bf16");
return {out0: v13};
}, {v0: k.tensor([1, 1], "i64"), v1: k.tensor([64044, 256], "bf16"), v2: k.tensor([514, 256], "bf16"), v3: k.tensor([256], "bf16"), v4: k.tensor([256], "bf16")});
