project("passnet").program(({v0, v1}) => {
const v2 = N.cast(N.matmul(N.cast(v0, "f32"), N.cast(v1, "f32")), "f32");
const v3 = N.transpose(v2, 1, 2);
const v4 = N.reshape(v3, [2, 5, 3]);
return {out0: v4};
}, {v0: k.tensor([2, 1, 5, 7], "f32"), v1: k.tensor([2, 1, 7, 3], "f32")});
