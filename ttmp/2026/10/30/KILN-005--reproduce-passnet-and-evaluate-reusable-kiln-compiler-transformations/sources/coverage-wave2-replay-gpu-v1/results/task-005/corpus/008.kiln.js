project("passnet").program(({v0, v1, v2, v3, v4, v5}) => {
const v6 = N.expect(N.cast(N.linear(N.cast(v0, "f32"), N.cast(v1, "f32"), N.cast(v2, "f32")), "bf16"), [16, 128, 128], "bf16");
const v7 = N.expect(N.reshape(v6, [16, 128, 2, 64]), [16, 128, 2, 64], "bf16");
const v8 = N.expect(N.transpose(v7, 1, 2), [16, 2, 128, 64], "bf16");
const v9 = N.expect(N.cast(v8, "bf16"), [16, 2, 128, 64], "bf16");
const v10 = N.expect(N.cast(N.matmul(N.safeSoftmax(N.add(N.mul(N.matmul(N.cast(v3, "f32"), N.transpose(N.cast(v4, "f32"), -2, -1), "highest"), 0.125), N.cast(v5, "f32")), -1), N.cast(v9, "f32"), "highest"), "bf16"), [16, 2, 128, 64], "bf16");
const v11 = N.expect(N.transpose(v10, 1, 2), [16, 128, 2, 64], "bf16");
const v12 = N.expect(N.reshape(v11, [16, 128, 128]), [16, 128, 128], "bf16");
return {out0: v12};
}, {v0: k.tensor([16, 128, 128], "bf16"), v1: k.tensor([128, 128], "bf16"), v2: k.tensor([128], "bf16"), v3: k.tensor([16, 2, 128, 64], "bf16"), v4: k.tensor([16, 2, 128, 64], "bf16"), v5: k.tensor([16, 1, 128, 128], "bf16")});
