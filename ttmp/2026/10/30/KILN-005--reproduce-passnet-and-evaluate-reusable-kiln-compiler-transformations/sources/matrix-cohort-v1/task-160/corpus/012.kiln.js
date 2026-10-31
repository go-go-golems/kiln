project("passnet").program(({v0, v1}) => {
const v2 = N.cast(N.matmul(N.cast(v0, "f32"), N.cast(v1, "f32")), "bf16");
const v3 = N.reshape(v2, [4, 80, 1, 1]);
return {out0: v3};
}, {v0: k.tensor([4, 1, 80, 3072], "bf16"), v1: k.tensor([4, 1, 3072, 1], "bf16")});
