project("passnet").program(({v0, v1}) => {
const v2 = N.expect(N.cast(N.matmul(N.cast(v0, "f32"), N.cast(v1, "f32")), "bf16"), [4, 1, 512, 1], "bf16");
const v3 = N.expect(N.reshape(v2, [4, 512, 1, 1]), [4, 512, 1, 1], "bf16");
return {out0: v3};
}, {v0: k.tensor([4, 1, 512, 4096], "bf16"), v1: k.tensor([4, 1, 4096, 1], "bf16")});
