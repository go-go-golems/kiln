project("passnet").program(({v0, v1, v2}) => {
const v3 = N.cast(N.matmul(N.cast(v0, "f32"), N.cast(v1, "f32")), "bf16");
const v4 = N.reshape(v3, [45, 16]);
const v5 = N.transpose(v2, 3, 2);
return {out0: v4, out1: v5};
}, {v0: k.tensor([90, 8, 9], "bf16"), v1: k.tensor([90, 9, 1], "bf16"), v2: k.tensor([1, 2, 45, 8], "bf16")});
