project("passnet").program(({v0, v1}) => {
const v2 = N.cast(N.matmul(N.cast(v0, "f32"), N.cast(v1, "f32")), "f16");
const v3 = N.reshape(v2, [1, 256, 20, 20]);
return {out0: v3};
}, {v0: k.tensor([1, 4, 64, 400], "f16"), v1: k.tensor([1, 4, 400, 400], "f16")});
