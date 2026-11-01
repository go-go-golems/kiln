project("passnet").program(({v0, v1}) => {
const v2 = N.expect(N.cumsum(v0, -1), [1, 64], "i64");
const v3 = N.expect(N.sub(v2, N.int(1)), [1, 64], "i64");
const v4 = N.expect(N.eq(v1, N.int(0)), [1, 64], "bool");
const v5 = N.expect(N.maskedFill(v3, v4, N.int(1)), [1, 64], "i64");
const v6 = N.expect(N.reshape(v5, [1, 1, 64]), [1, 1, 64], "i64");
const v7 = N.expect(N.expand(v6, [3, -1, -1]), [3, 1, 64], "i64");
const v8 = N.expect(v7, [3, 1, 64], "i64");
const v9_0 = N.expect(N.amax(v8, 0, false), [1, 64], "i64");
const v9_1 = N.expect(N.argmax(v8, 0, false), [1, 64], "i64");
const v10 = N.expect(v9_0, [1, 64], "i64");
const v11_0 = N.expect(N.amax(v10, -1, true), [1, 1], "i64");
const v11_1 = N.expect(N.argmax(v10, -1, true), [1, 1], "i64");
const v12 = N.expect(v11_0, [1, 1], "i64");
const v13 = N.expect(N.add(v12, N.int(1)), [1, 1], "i64");
const v14 = N.expect(N.sub(v13, N.int(9)), [1, 1], "i64");
return {out0: v14, out1: v8, out2: v5};
}, {v0: k.tensor([1, 64], "i64"), v1: k.tensor([1, 64], "i64")});
