project("passnet").program(({v0, v1}) => {
const v2 = N.expect(N.cast(N.matmul(N.cast(v0, "f32"), N.cast(v1, "f32")), "bf16"), [128, 1, 304, 1], "bf16");
const v3 = N.expect(N.reshape(v2, [128, 304, 1, 1]), [128, 304, 1, 1], "bf16");
return {out0: v3};
}, {v0: k.tensor([128, 1, 304, 192], "bf16"), v1: k.tensor([128, 1, 192, 1], "bf16")});
