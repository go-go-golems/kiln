project("passnet").program(({}) => {
const v0 = N.expect(N.arange(0, 1000, 1, "i64"), [1000], "i64");
const v1 = N.expect(N.reshape(v0, [1, 1000]), [1, 1000], "i64");
const v2 = N.expect(N.repeat(v1, [2, 1]), [2, 1000], "i64");
return {out0: v2};
}, {});
