project("passnet").program(({v0}) => {
const v1 = N.expect(N.ne(v0, N.int(1)), [1, 19], "bool");
const v2 = N.expect(N.cast(v1, "i32"), [1, 19], "i32");
const v3 = N.expect(N.cumsum(v2, 1), [1, 19], "i64");
const v4 = N.expect(N.cast(v3, "i32"), [1, 19], "i32");
const v5 = N.expect(N.add(v4, N.int(0)), [1, 19], "i32");
const v6 = N.expect(N.mul(v5, v2), [1, 19], "i32");
const v7 = N.expect(N.cast(v6, "i64"), [1, 19], "i64");
const v8 = N.expect(N.add(v7, N.int(1)), [1, 19], "i64");
return {out0: v8};
}, {v0: k.tensor([1, 19], "i64")});
