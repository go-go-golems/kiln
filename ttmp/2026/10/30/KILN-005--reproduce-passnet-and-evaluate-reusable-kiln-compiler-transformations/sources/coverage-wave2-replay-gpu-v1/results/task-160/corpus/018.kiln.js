project("passnet").program(({v0, v1}) => {
const v2 = N.expect(N.cast(N.matmul(N.cast(v0, "f32"), N.cast(v1, "f32")), "bf16"), [1, 2, 64, 400], "bf16");
const v3 = N.expect(N.reshape(v2, [1, 128, 20, 20]), [1, 128, 20, 20], "bf16");
return {out0: v3};
}, {v0: k.tensor([1, 2, 64, 400], "bf16"), v1: k.tensor([1, 2, 400, 400], "bf16")});
