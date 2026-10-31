project("passnet").program(({v0, v1}) => {
const v2 = N.transpose(v1, -1, -2);
const v3 = N.cast(N.matmul(N.cast(v0, "f32"), N.cast(v2, "f32")), "f32");
return {out0: v3};
}, {v0: k.tensor([5, 17], "f32"), v1: k.tensor([7, 17], "f32")});
