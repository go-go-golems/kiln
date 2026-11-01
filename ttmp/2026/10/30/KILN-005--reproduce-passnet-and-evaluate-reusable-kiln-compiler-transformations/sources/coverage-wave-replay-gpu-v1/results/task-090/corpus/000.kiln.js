project("passnet").program(({v0, v1, v2}) => {
const v3 = N.expect(N.cast(N.matmul(N.cast(v0, "f32"), N.cast(v1, "f32")), "f16"), [2, 1], "f16");
const v4 = N.expect(N.mul(v3, v2), [2, 1], "f16");
const v5 = N.expect(N.transpose(v4, 0, 1), [1, 2], "f16");
return {out0: v4, out1: v5};
}, {v0: k.tensor([2, 512], "f16"), v1: k.tensor([512, 1], "f16"), v2: k.tensor([], "f16")});
