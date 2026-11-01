project("passnet").program(({v0}) => {
const v1 = N.expect(N.cumsum(v0, 1), [1, 13], "i64");
const v2 = N.expect(N.mul(v1, v0), [1, 13], "i64");
const v3 = N.expect(N.sub(v2, N.int(1)), [1, 13], "i64");
const v4 = N.expect(N.cast(v3, "i64"), [1, 13], "i64");
const v5 = N.expect(N.reshape(v4, [1, 13]), [1, 13], "i64");
const v6 = N.expect(N.add(v5, N.int(2)), [1, 13], "i64");
return {out0: v6};
}, {v0: k.tensor([1, 13], "i64")});
