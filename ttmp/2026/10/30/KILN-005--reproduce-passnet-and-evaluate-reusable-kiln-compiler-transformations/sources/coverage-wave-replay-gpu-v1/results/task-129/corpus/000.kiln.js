project("passnet").program(({v0, v1}) => {
const v2 = N.expect(v0, [45, 45], "i64");
const v3 = N.expect(N.embedding(v2, v1), [45, 45, 4], "f16");
const v4 = N.expect(N.transpose(N.transpose(v3, 0, 2), 1, 2), [4, 45, 45], "f16");
const v5 = N.expect(N.reshape(v4, [1, 4, 45, 45]), [1, 4, 45, 45], "f16");
const v6 = N.expect(N.expand(v5, [1, -1, 45, 45]), [1, 4, 45, 45], "f16");
const v7 = N.expect(N.reshape(v6, [1, 4, 45, 45]), [1, 4, 45, 45], "f16");
return {out0: v7};
}, {v0: k.tensor([45, 45], "i64"), v1: k.tensor([32, 4], "f16")});
