project("passnet").program(({v0, v1, v2}) => {
const v3 = N.expect(N.reshape(v0, [256, 1]), [256, 1], "f16");
const v4 = N.expect(N.mul(v3, v1), [256, 128], "f16");
const v5 = N.expect(N.reshape(v2, [256, 1]), [256, 1], "i64");
const v6 = N.expect(N.expand(v5, [256, 128]), [256, 128], "i64");
const v7 = N.expect(N.full([128, 128], 0, "f16"), [128, 128], "f16");
return {out0: v6, out1: v7, out2: v4};
}, {v0: k.tensor([256], "f16"), v1: k.tensor([256, 128], "f16"), v2: k.tensor([256], "i64")});
