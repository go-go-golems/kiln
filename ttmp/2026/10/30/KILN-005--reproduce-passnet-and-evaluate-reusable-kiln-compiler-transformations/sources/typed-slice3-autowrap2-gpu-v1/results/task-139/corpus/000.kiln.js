project("passnet").program(({v0, v1}) => {
const v2 = N.expect(N.mul(v0, 1000000.0), [1, 17, 1], "f32");
const v3 = N.expect(N.sub(v1, v2), [1, 17, 2], "f32");
const v4_0 = N.expect(N.slice(v3, 2, 0, 1), [1, 17, 1], "f32");
const v4_1 = N.expect(N.slice(v3, 2, 1, 2), [1, 17, 1], "f32");
const v5 = N.expect(v4_0, [1, 17, 1], "f32");
const v6 = N.expect(v4_1, [1, 17, 1], "f32");
const v7 = N.expect(N.reshape(v5, [1, 17]), [1, 17], "f32");
const v8 = N.expect(N.reshape(v7, [1, 17]), [1, 17], "f32");
const v9 = N.expect(N.reshape(v6, [1, 17]), [1, 17], "f32");
const v10 = N.expect(N.reshape(v9, [1, 17]), [1, 17], "f32");
return {out0: v8, out1: v10};
}, {v0: k.tensor([1, 17, 1], "i64"), v1: k.tensor([1, 17, 2], "f16")});
