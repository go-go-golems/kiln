project("passnet").program(({v0, v1, v2, v3, v4, v5}) => {
const v6 = N.expect(N.mul(v0, v1), [1, 1, 3, 256], "bf16");
const v7 = N.expect(N.reshape(N.slice(v0, 3, 0, 128), [1, 1, 3, 128]), [1, 1, 3, 128], "bf16");
const v8 = N.expect(N.reshape(N.slice(v0, 3, 128, 256), [1, 1, 3, 128]), [1, 1, 3, 128], "bf16");
const v9 = N.expect(N.neg(v8), [1, 1, 3, 128], "bf16");
const v10 = N.expect(N.concat([v9, v7], -1), [1, 1, 3, 256], "bf16");
const v11 = N.expect(N.mul(v10, v2), [1, 1, 3, 256], "bf16");
const v12 = N.expect(N.add(v6, v11), [1, 1, 3, 256], "bf16");
const v13 = N.expect(N.reshape(v12, [1, 1, 1, 3, 256]), [1, 1, 1, 3, 256], "bf16");
const v14 = N.expect(N.expand(v13, [1, 1, 8, 3, 256]), [1, 1, 8, 3, 256], "bf16");
const v15 = N.expect(N.reshape(v14, [1, 8, 3, 256]), [1, 8, 3, 256], "bf16");
const v16 = N.expect(N.reshape(v3, [1, 1, 1, 3, 256]), [1, 1, 1, 3, 256], "bf16");
const v17 = N.expect(N.expand(v16, [1, 1, 8, 3, 256]), [1, 1, 8, 3, 256], "bf16");
const v18 = N.expect(N.reshape(v17, [1, 8, 3, 256]), [1, 8, 3, 256], "bf16");
const v19 = N.expect(N.reshape(v4, [1, 1, 3, 3]), [1, 1, 3, 3], "bool");
const v20 = N.expect(N.reshape(v5, [1, 8, 3, 256]), [1, 8, 3, 256], "bf16");
return {out0: v19, out1: v12, out2: v15, out3: v20, out4: v18};
}, {v0: k.tensor([1, 1, 3, 256], "bf16"), v1: k.tensor([1, 1, 3, 256], "bf16"), v2: k.tensor([1, 1, 3, 256], "bf16"), v3: k.tensor([1, 1, 3, 256], "bf16"), v4: k.tensor([1, 1, 3, 3], "bool"), v5: k.tensor([1, 8, 3, 256], "bf16")});
