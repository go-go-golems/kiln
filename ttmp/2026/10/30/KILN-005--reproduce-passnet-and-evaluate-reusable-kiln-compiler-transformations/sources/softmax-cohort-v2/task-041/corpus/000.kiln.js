project("passnet").program(({v0, v1, v2}) => {
const v3 = N.cast(N.matmul(N.cast(v0, "f32"), N.cast(v1, "f32")), "bf16");
const v4 = N.mul(v3, 1.0);
const v5 = N.cast(N.softmax(N.cast(N.cast(v4, "f32"), "f32"), 3), "f32");
const v6 = N.cast(v5, "f32");
const v7 = v6;
const v8 = N.cast(v7, "bf16");
const v9 = N.cast(N.matmul(N.cast(v8, "f32"), N.cast(v2, "f32")), "bf16");
const v10 = N.transpose(v9, 1, 2);
const v11 = N.reshape(v10, [1, 257, 16, 80]);
const v12 = N.reshape(v11, [1, 257, 1280]);
const v13 = N.reshape(v12, [1, 257, 1280]);
return {out0: v13};
}, {v0: k.tensor([1, 16, 257, 80], "bf16"), v1: k.tensor([1, 16, 80, 257], "bf16"), v2: k.tensor([1, 16, 257, 80], "bf16")});
