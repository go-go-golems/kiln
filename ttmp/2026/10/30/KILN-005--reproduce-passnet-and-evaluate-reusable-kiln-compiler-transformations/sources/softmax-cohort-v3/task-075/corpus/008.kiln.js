project("passnet").program(({v0, v1, v2}) => {
const v3 = N.cast(N.matmul(N.cast(v0, "f32"), N.cast(v1, "f32")), "f32");
const v4 = N.div(v3, 5.656854249492381);
const v5 = N.cast(N.softmax(N.cast(v4, "f32"), 3), "f32");
const v6 = v5;
const v7 = N.cast(N.matmul(N.cast(v6, "f32"), N.cast(v2, "f32")), "f32");
const v8 = N.transpose(v7, 1, 2);
const v9 = N.reshape(v8, [64, 1024, 5, 32]);
const v10 = N.reshape(v9, [64, 1024, 160]);
return {out0: v10};
}, {v0: k.tensor([64, 5, 1024, 32], "f32"), v1: k.tensor([64, 5, 32, 256], "f32"), v2: k.tensor([64, 5, 256, 32], "f32")});
