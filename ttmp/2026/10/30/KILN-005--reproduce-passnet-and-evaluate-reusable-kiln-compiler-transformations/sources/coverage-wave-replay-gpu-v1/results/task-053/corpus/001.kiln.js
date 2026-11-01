project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.expect(N.arange(0, 9, 1, "i64"), [9], "i64");
const v5 = N.expect(N.reshape(v4, [1, 9]), [1, 9], "i64");
const v6 = N.expect(N.add(v5, N.int(2)), [1, 9], "i64");
const v7 = N.expect(N.reshape(v6, [9]), [9], "i64");
const v8 = N.expect(N.indexSelect(v0, 0, v7), [9, 2048], "f16");
const v9 = N.expect(N.reshape(v8, [1, 9, 2048]), [1, 9, 2048], "f16");
const v10 = N.expect(v9, [1, 9, 2048], "f16");
const v11 = N.expect(v10, [1, 9, 2048], "f16");
const v12 = N.expect(N.add(v1, v11), [1, 9, 2048], "f16");
const v13 = N.expect(v12, [1, 9, 2048], "f16");
const v14 = N.expect(N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v13, "f32"), [9, 2048]), N.reshape(N.cast(v2, "f32"), [2048]), N.reshape(N.cast(v3, "f32"), [2048]), {"eps": 1e-05}), [1, 9, 2048]), "f16"), [1, 9, 2048], "f16");
return {out0: v13, out1: v14};
}, {v0: k.tensor([2050, 2048], "f16"), v1: k.tensor([1, 9, 2048], "f16"), v2: k.tensor([2048], "f16"), v3: k.tensor([2048], "f16")});
