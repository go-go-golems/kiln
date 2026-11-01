project("passnet").program(({v0, v1}) => {
const v2 = N.expect(v0, [7, 7], "i64");
const v3 = N.expect(N.embedding(v2, v1), [7, 7, 12], "f32");
const v4 = N.expect(N.transpose(N.transpose(v3, 0, 2), 1, 2), [12, 7, 7], "f32");
const v5 = N.expect(N.reshape(v4, [1, 12, 7, 7]), [1, 12, 7, 7], "f32");
const v6 = N.expect(N.expand(v5, [2, -1, 7, 7]), [2, 12, 7, 7], "f32");
const v7 = N.expect(N.reshape(v6, [2, 12, 7, 7]), [2, 12, 7, 7], "f32");
return {out0: v7};
}, {v0: k.tensor([7, 7], "i64"), v1: k.tensor([32, 12], "f32")});
