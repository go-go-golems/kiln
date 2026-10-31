project("passnet").program(({v0, v1, v2, v3, v4}) => {
const v5 = N.cast(N.linear(N.cast(v2, "f32"), N.cast(v1, "f32"), N.cast(v0, "f32")), "f32");
const v6 = N.reshape(v5, [1, 49, 12, 64]);
const v7 = N.transpose(v6, 1, 2);
const v8 = N.reshape(v4, [1, 12, 49, 64]);
const v9 = N.reshape(v3, [1, 12, 49, 64]);
return {out0: v9, out1: v8, out2: v7};
}, {v0: k.tensor([768], "f32"), v1: k.tensor([768, 768], "f32"), v2: k.tensor([1, 49, 768], "f32"), v3: k.tensor([1, 12, 49, 64], "f32"), v4: k.tensor([1, 12, 49, 64], "f32")});
