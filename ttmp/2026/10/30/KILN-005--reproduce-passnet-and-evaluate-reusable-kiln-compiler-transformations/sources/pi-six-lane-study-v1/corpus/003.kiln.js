project("passnet").program(({v0, v1, v2}) => {
const v3 = N.cast(N.linear(N.cast(v1, "f32"), N.cast(v0, "f32"), null), "f32");
const v4 = N.reshape(v2, [1, 82, 8, 64]);
const v5 = N.transpose(v4, 1, 2);
const v6 = N.reshape(v3, [1, 82, 8, 64]);
const v7 = N.transpose(v6, 1, 2);
const v8 = N.transpose(v5, 3, 2);
return {out0: v8, out1: v7};
}, {v0: k.tensor([512, 512], "f32"), v1: k.tensor([1, 82, 512], "f32"), v2: k.tensor([1, 82, 512], "f32")});
