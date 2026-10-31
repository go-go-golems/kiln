project("passnet").program(({v0, v1, v2}) => {
const v3 = N.div(v0, 8.0);
const v4 = N.add(v3, v1);
const v5 = N.cast(N.softmax(N.cast(v4, "f32"), 3), "f32");
const v6 = v5;
const v7 = N.cast(N.matmul(N.cast(v6, "f32"), N.cast(v2, "f32")), "f32");
const v8 = N.transpose(v7, 1, 2);
const v9 = N.reshape(v8, [1, 26, 12, 64]);
const v10 = N.reshape(v9, [1, 26, 768]);
return {out0: v10};
}, {v0: k.tensor([1, 12, 26, 26], "f32"), v1: k.tensor([1, 1, 1, 26], "f32"), v2: k.tensor([1, 12, 26, 64], "f32")});
