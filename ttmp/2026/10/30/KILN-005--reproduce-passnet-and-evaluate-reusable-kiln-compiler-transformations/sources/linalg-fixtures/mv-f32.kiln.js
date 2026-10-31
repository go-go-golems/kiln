project("passnet").program(({v0, v1}) => {
const v2 = N.cast(N.matmul(N.cast(v0, "f32"), N.cast(v1, "f32")), "f32");
return {out0: v2};
}, {v0: k.tensor([5, 17], "f32"), v1: k.tensor([17], "f32")});
