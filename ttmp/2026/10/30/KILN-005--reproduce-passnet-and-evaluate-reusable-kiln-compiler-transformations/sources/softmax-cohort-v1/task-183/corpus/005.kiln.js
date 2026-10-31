project("passnet").program(({v0, v1, v2}) => {
const v3 = N.cast(N.matmul(N.cast(v0, "f32"), N.cast(v1, "f32")), "f32");
const v4 = N.cast(N.softmax(N.cast(v3, "f32"), 2), "f32");
const v5 = v4;
const v6 = N.cast(N.matmul(N.cast(v5, "f32"), N.cast(v2, "f32")), "f32");
const v7 = N.reshape(v6, [1, 8, 1, 32]);
const v8 = N.transpose(v7, 1, 2);
const v9 = N.reshape(v8, [1, 1, 256]);
return {out0: v9};
}, {v0: k.tensor([8, 1, 32], "f32"), v1: k.tensor([8, 32, 1], "f32"), v2: k.tensor([8, 1, 32], "f32")});
