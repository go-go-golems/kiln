project("passnet").program(({}) => {
const v0 = N.expect(N.arange(0, 128, 1, "i64"), [128], "i64");
const v1 = N.expect(N.reshape(v0, [1, 128]), [1, 128], "i64");
const v2 = N.expect(N.repeat(v1, [2, 1]), [2, 128], "i64");
return {out0: v2};
}, {});
