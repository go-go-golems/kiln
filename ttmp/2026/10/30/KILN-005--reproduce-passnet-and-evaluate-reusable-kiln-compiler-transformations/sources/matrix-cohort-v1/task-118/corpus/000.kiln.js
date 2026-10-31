project("passnet").program(({v0, v1, v2}) => {
const v3 = N.cast(N.linear(N.cast(v0, "f32"), N.cast(v1, "f32"), N.cast(v2, "f32")), "f32");
const v4 = N.transpose(v3, 1, 2);
const v5 = N.reshape(v4, [2, 768, 16, 16]);
const v6 = N.resizeBilinear(v5, [128, 128]);
return {out0: v6};
}, {v0: k.tensor([2, 256, 512], "f32"), v1: k.tensor([768, 512], "f32"), v2: k.tensor([768], "f32")});
