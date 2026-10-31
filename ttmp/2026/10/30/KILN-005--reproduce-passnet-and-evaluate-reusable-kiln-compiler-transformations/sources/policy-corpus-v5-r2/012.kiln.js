project("passnet").program(({v0, v1, v2}) => {
const v3 = N.cast(N.linear(N.cast(v2, "f32"), N.cast(v1, "f32"), N.cast(v0, "f32")), "f32");
const v4 = N.reshape(v3, [2, 34, 2, 64]);
const v5 = N.transpose(v4, 1, 2);
return {out0: v5};
}, {v0: k.tensor([128], "f32"), v1: k.tensor([128, 128], "f32"), v2: k.tensor([2, 34, 128], "f32")});
