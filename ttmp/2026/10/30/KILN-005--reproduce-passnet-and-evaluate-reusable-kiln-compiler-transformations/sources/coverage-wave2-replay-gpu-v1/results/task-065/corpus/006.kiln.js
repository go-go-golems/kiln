project("passnet").program(({v0, v1, v2}) => {
const v3 = N.expect(N.mul(v0, v1), [512, 17, 2, 128], "bf16");
const v4 = N.expect(N.add(v3, v2), [512, 17, 2, 128], "bf16");
const v5_0 = N.expect(N.reshape(N.slice(v4, 2, 0, 1), [512, 17, 128]), [512, 17, 128], "bf16");
const v5_1 = N.expect(N.reshape(N.slice(v4, 2, 1, 2), [512, 17, 128]), [512, 17, 128], "bf16");
const v6 = N.expect(v5_0, [512, 17, 128], "bf16");
const v7 = N.expect(v5_1, [512, 17, 128], "bf16");
const v8 = N.expect(N.transpose(v7, 1, 2), [512, 128, 17], "bf16");
return {out0: v8, out1: v6};
}, {v0: k.tensor([512, 17, 1, 128], "bf16"), v1: k.tensor([1, 1, 2, 128], "bf16"), v2: k.tensor([2, 128], "bf16")});
