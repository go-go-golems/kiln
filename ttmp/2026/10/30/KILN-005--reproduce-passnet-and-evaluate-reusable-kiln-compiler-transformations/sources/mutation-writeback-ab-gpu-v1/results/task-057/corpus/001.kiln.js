project("passnet").program(({v0, v1, v2, v3, v4}) => {
const v5 = N.expect(N.cast(N.transpose(N.reshape(N.matmul(N.reshape(N.transpose(N.cast(v0, "f32"), 1, 2), [256, 512, 64]), N.reshape(N.transpose(N.cast(v1, "f32"), 2, 3), [256, 64, 64])), [4, 64, 512, 64]), 1, 2), "bf16"), [4, 512, 64, 64], "bf16");
const v6 = N.expect(N.add(v2, v5), [4, 512, 64, 64], "bf16");
const v7 = N.expect(N.mul(v6, v3), [4, 512, 64, 64], "bf16");
const v8 = N.expect(N.add(v7, v4), [4, 512, 64, 64], "bf16");
const v9 = N.expect(N.reshape(v8, [4, 512, 64, 64]), [4, 512, 64, 64], "bf16");
return {out0: v9, __mut2: v6};
}, {v0: k.tensor([4, 512, 64, 64], "bf16"), v1: k.tensor([4, 64, 64, 64], "bf16"), v2: k.tensor([4, 512, 64, 64], "bf16"), v3: k.tensor([], "bf16"), v4: k.tensor([4, 512, 64, 64], "bf16")});
