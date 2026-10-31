project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.cast(N.matmul(N.cast(v1, "f32"), N.cast(v2, "f32")), "f32");
const v5 = N.div(v4, 8.0);
const v6 = N.add(v5, v0);
const v7 = N.cast(N.softmax(N.cast(v6, "f32"), 3), "f32");
const v8 = v7;
const v9 = N.cast(N.matmul(N.cast(v8, "f32"), N.cast(v3, "f32")), "f32");
const v10 = N.transpose(v9, 1, 2);
const v11 = N.reshape(v10, [1, 64, 12, 64]);
const v12 = N.reshape(v11, [1, 64, 768]);
return {out0: v12};
}, {v0: k.tensor([1, 1, 1, 64], "f32"), v1: k.tensor([1, 12, 64, 64], "f32"), v2: k.tensor([1, 12, 64, 64], "f32"), v3: k.tensor([1, 12, 64, 64], "f32")});
