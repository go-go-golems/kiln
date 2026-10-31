project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.cast(N.linear(N.cast(v3, "f32"), N.cast(v1, "f32"), N.cast(v0, "f32")), "f32");
const v5 = N.reshape(v4, [1, 64, 6, 64]);
const v6 = N.transpose(v5, 1, 2);
const v7 = N.transpose(v2, -1, -2);
return {out0: v7, out1: v6};
}, {v0: k.tensor([384], "f32"), v1: k.tensor([384, 384], "f32"), v2: k.tensor([1, 6, 64, 64], "f32"), v3: k.tensor([1, 64, 384], "f32")});
