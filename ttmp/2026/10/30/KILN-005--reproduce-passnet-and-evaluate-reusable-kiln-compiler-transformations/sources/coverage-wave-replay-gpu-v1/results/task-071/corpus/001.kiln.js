project("passnet").program(({v0}) => {
const v1 = N.expect(N.arange(0, 1024, 1, "i64"), [1024], "i64");
const v2 = N.expect(N.cast(v0, "bool"), [2, 1024], "bool");
return {out0: v1, out1: v2};
}, {v0: k.tensor([2, 1024], "i64")});
