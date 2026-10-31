project("passnet").program(({v0, v1, v2, v3, v4}) => {
const v5 = N.cast(N.linear(N.cast(v3, "f32"), N.cast(v1, "f32"), N.cast(v0, "f32")), "f32");
const v6 = N.reshape(v4, [1, 60, 8, 64]);
const v7 = N.transpose(v6, 1, 2);
const v8 = N.reshape(v5, [1, 60, 8, 64]);
const v9 = N.transpose(v8, 1, 2);
const v10 = N.reshape(v2, [1, 1, 60, 60]);
return {out0: v10, out1: v7, out2: v9};
}, {v0: k.tensor([512], "f32"), v1: k.tensor([512, 512], "f32"), v2: k.tensor([1, 1, 60, 60], "f32"), v3: k.tensor([1, 60, 512], "f32"), v4: k.tensor([1, 60, 512], "f32")});
