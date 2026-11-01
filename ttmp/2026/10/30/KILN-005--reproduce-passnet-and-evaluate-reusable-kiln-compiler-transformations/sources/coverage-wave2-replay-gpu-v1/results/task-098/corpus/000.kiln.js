project("passnet").program(({v0, v1, v2}) => {
const v3 = N.expect(N.reshape(v0, [1100, 1]), [1100, 1], "bf16");
const v4 = N.expect(N.mul(v3, v1), [1100, 16], "bf16");
const v5 = N.expect(N.reshape(v2, [1100, 1]), [1100, 1], "i64");
const v6 = N.expect(N.expand(v5, [1100, 16]), [1100, 16], "i64");
const v7 = N.expect(N.full([1000, 16], 0, "bf16"), [1000, 16], "bf16");
return {out0: v6, out1: v7, out2: v4};
}, {v0: k.tensor([1100], "bf16"), v1: k.tensor([1100, 16], "bf16"), v2: k.tensor([1100], "i64")});
