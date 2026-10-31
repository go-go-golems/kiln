project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.div(v0, 2.8284271247461903);
const v5 = N.add(v4, v1);
const v6 = N.cast(N.softmax(N.cast(v5, "f32"), 3), "f16");
const v7 = v6;
const v8 = N.cast(N.matmul(N.cast(v7, "f32"), N.cast(v2, "f32")), "f16");
const v9 = N.transpose(v8, 1, 2);
const v10 = N.reshape(v9, [1, 45, 2, 8]);
const v11 = N.reshape(v3, [1, 45, 2, 8]);
return {out0: v10, out1: v11};
}, {v0: k.tensor([1, 2, 45, 45], "f16"), v1: k.tensor([1, 1, 1, 45], "f16"), v2: k.tensor([1, 2, 45, 8], "f16"), v3: k.tensor([45, 16], "f16")});
