project("passnet").program(({v0, v1, v2}) => {
const v3 = N.cast(N.matmul(N.cast(v0, "f32"), N.cast(v1, "f32")), "bf16");
const v4 = N.cast(N.softmax(N.cast(v3, "f32"), 2), "bf16");
const v5 = v4;
const v6 = N.cast(N.matmul(N.cast(v5, "f32"), N.cast(v2, "f32")), "bf16");
const v7 = N.reshape(v6, [1, 16, 1, 64]);
const v8 = N.transpose(v7, 1, 2);
const v9 = N.reshape(v8, [1, 1, 1024]);
return {out0: v9};
}, {v0: k.tensor([16, 1, 64], "bf16"), v1: k.tensor([16, 64, 1], "bf16"), v2: k.tensor([16, 1, 64], "bf16")});
