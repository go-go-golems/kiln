project("passnet").program(({v0, v1}) => {
const v2 = N.mul(0.0625, v0);
const v3 = N.cast(N.softmax(N.cast(v2, "f32"), 2), "f32");
const v4 = N.cast(N.matmul(N.cast(v3, "f32"), N.cast(v1, "f32")), "f32");
const v5 = N.transpose(v4, 1, 2);
return {out0: v5};
}, {v0: k.tensor([6, 8192, 19], "f32"), v1: k.tensor([6, 19, 256], "f32")});
