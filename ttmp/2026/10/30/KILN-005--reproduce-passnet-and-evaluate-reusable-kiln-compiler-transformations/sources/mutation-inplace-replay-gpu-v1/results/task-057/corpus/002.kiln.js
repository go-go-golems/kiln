project("passnet").program(({v0, v1, v2, v3, v4}) => {
const v5 = N.expect(N.cast(N.transpose(N.reshape(N.matmul(N.reshape(N.transpose(N.cast(v0, "f32"), 1, 2), [64, 512, 64]), N.reshape(N.transpose(N.cast(v1, "f32"), 2, 3), [64, 64, 64])), [1, 64, 512, 64]), 1, 2), "f16"), [1, 512, 64, 64], "f16");
const v6 = N.expect(N.add(v2, v5), [1, 512, 64, 64], "f16");
const v7 = N.expect(N.mul(v6, v3), [1, 512, 64, 64], "f16");
const v8 = N.expect(N.add(v7, v4), [1, 512, 64, 64], "f16");
const v9 = N.expect(N.reshape(v8, [1, 512, 64, 64]), [1, 512, 64, 64], "f16");
return {out0: v9, __mut2: v6};
}, {v0: k.tensor([1, 512, 64, 64], "f16"), v1: k.tensor([1, 64, 64, 64], "f16"), v2: k.tensor([1, 512, 64, 64], "f16"), v3: k.tensor([], "f16"), v4: k.tensor([1, 512, 64, 64], "f16")});
