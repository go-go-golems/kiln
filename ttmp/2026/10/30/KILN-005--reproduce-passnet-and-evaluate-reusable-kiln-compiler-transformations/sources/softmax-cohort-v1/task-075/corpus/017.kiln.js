project("passnet").program(({v0, v1, v2}) => {
const v3 = N.cast(N.matmul(N.cast(v0, "f32"), N.cast(v1, "f32")), "f16");
const v4 = N.div(v3, 8.0);
const v5 = N.cast(N.softmax(N.cast(v4, "f32"), 3), "f16");
const v6 = v5;
const v7 = N.cast(N.matmul(N.cast(v6, "f32"), N.cast(v2, "f32")), "f16");
const v8 = N.transpose(v7, 1, 2);
const v9 = N.reshape(v8, [24, 16384, 1, 64]);
const v10 = N.reshape(v9, [24, 16384, 64]);
return {out0: v10};
}, {v0: k.tensor([24, 1, 16384, 64], "f16"), v1: k.tensor([24, 1, 64, 256], "f16"), v2: k.tensor([24, 1, 256, 64], "f16")});
