project("passnet").program(({v0, v1}) => {
const v2 = N.expect(v0, [11, 11], "i64");
const v3 = N.expect(N.embedding(v2, v1), [11, 11, 12], "bf16");
const v4 = N.expect(N.transpose(N.transpose(v3, 0, 2), 1, 2), [12, 11, 11], "bf16");
const v5 = N.expect(N.reshape(v4, [1, 12, 11, 11]), [1, 12, 11, 11], "bf16");
const v6 = N.expect(N.expand(v5, [1, -1, 11, 11]), [1, 12, 11, 11], "bf16");
const v7 = N.expect(N.reshape(v6, [1, 12, 11, 11]), [1, 12, 11, 11], "bf16");
return {out0: v7};
}, {v0: k.tensor([11, 11], "i64"), v1: k.tensor([32, 12], "bf16")});
