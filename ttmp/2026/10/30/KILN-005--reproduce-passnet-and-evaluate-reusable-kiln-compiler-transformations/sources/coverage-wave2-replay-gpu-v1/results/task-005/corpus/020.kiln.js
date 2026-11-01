project("passnet").program(({v0, v1, v2, v3, v4, v5}) => {
const v6 = N.expect(N.cast(N.linear(N.cast(v0, "f32"), N.cast(v1, "f32"), N.cast(v2, "f32")), "bf16"), [1, 64, 128], "bf16");
const v7 = N.expect(N.reshape(v6, [1, 64, 2, 64]), [1, 64, 2, 64], "bf16");
const v8 = N.expect(N.transpose(v7, 1, 2), [1, 2, 64, 64], "bf16");
const v9 = N.expect(N.cast(N.matmul(N.safeSoftmax(N.add(N.mul(N.matmul(N.cast(v3, "f32"), N.transpose(N.cast(v4, "f32"), -2, -1), "highest"), 0.125), N.cast(v5, "f32")), -1), N.cast(v8, "f32"), "highest"), "bf16"), [1, 2, 64, 64], "bf16");
const v10 = N.expect(N.transpose(v9, 1, 2), [1, 64, 2, 64], "bf16");
const v11 = N.expect(N.reshape(v10, [1, 64, 128]), [1, 64, 128], "bf16");
return {out0: v11};
}, {v0: k.tensor([1, 64, 128], "bf16"), v1: k.tensor([128, 128], "bf16"), v2: k.tensor([128], "bf16"), v3: k.tensor([1, 2, 64, 64], "bf16"), v4: k.tensor([1, 2, 64, 64], "bf16"), v5: k.tensor([1, 1, 64, 64], "bf16")});
