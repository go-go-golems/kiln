project("passnet").program(({v0, v1, v2}) => {
const v3 = N.cast(N.linear(N.cast(v2, "f32"), N.cast(v1, "f32"), N.cast(v0, "f32")), "f32");
const v4 = N.reshape(v3, [1, 20, 8, 64]);
const v5 = N.transpose(v4, 1, 2);
return {out0: v5};
}, {v0: k.tensor([512], "f32"), v1: k.tensor([512, 512], "f32"), v2: k.tensor([1, 20, 512], "f32")});
