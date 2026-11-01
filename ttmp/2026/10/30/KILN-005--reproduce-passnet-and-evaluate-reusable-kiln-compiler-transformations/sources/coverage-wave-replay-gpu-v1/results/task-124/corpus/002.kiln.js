project("passnet").program(({v0, v1, v2, v3, v4, v5}) => {
const v6 = N.expect(N.cast(N.rsqrt(N.cast(v0, "f32")), "bf16"), [128], "bf16");
const v7 = N.expect(N.eq(v6, Infinity), [128], "bool");
const v8 = N.expect(N.maskedFill(v6, v7, N.int(0)), [128], "bf16");
const v9 = N.expect(N.gather(v8, v1, 0, true), [256], "bf16");
const v10 = N.expect(N.mul(v9, v2), [256], "bf16");
const v11 = N.expect(N.gather(v8, v3, 0, true), [256], "bf16");
const v12 = N.expect(N.mul(v10, v11), [256], "bf16");
const v13 = N.expect(N.cast(N.linear(N.cast(v4, "f32"), N.cast(v5, "f32"), null), "bf16"), [128, 128], "bf16");
return {out0: v12, out1: v13, __mut0: v8};
}, {v0: k.tensor([128], "bf16"), v1: k.tensor([256], "i64"), v2: k.tensor([256], "bf16"), v3: k.tensor([256], "i64"), v4: k.tensor([128, 128], "bf16"), v5: k.tensor([128, 128], "bf16")});
