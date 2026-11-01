project("passnet").program(({v0, v1, v2}) => {
const v3 = N.expect(N.cast(N.softmax(N.cast(v0, "f32"), 2), "f16"), [64, 17, 4096], "f16");
const v4 = N.expect(N.reshape(v3, [64, 17, 64, 64]), [64, 17, 64, 64], "f16");
const v5 = N.expect(N.mul(v4, v1), [64, 17, 64, 64], "f16");
const v6 = N.expect(N.reshape(v5, [64, 17, 4096]), [64, 17, 4096], "f16");
const v7 = N.expect(N.cast(N.sum(N.cast(v6, "f32"), 2, true), "f16"), [64, 17, 1], "f16");
const v8 = N.expect(N.mul(v4, v2), [64, 17, 64, 64], "f16");
const v9 = N.expect(N.reshape(v8, [64, 17, 4096]), [64, 17, 4096], "f16");
const v10 = N.expect(N.cast(N.sum(N.cast(v9, "f32"), 2, true), "f16"), [64, 17, 1], "f16");
const v11 = N.expect(N.concat([v7, v10], -1), [64, 17, 2], "f16");
return {out0: v4, out1: v11};
}, {v0: k.tensor([64, 17, 4096], "f16"), v1: k.tensor([1, 1, 1, 64], "f16"), v2: k.tensor([1, 1, 64, 1], "f16")});
