project("passnet").program(({v0, v1, v2, v3, v4, v5}) => {
const v6 = N.cast(N.linear(N.cast(v3, "f32"), N.cast(v1, "f32"), N.cast(v0, "f32")), "f32");
const v7 = N.reshape(v4, [1, 42, 8, 64]);
const v8 = N.transpose(v7, 1, 2);
const v9 = N.reshape(v6, [1, 42, 8, 64]);
const v10 = N.transpose(v9, 1, 2);
const v11 = N.reshape(v2, [1, 1, 1, 42]);
const v12 = N.reshape(v5, [1, 8, 1, 64]);
return {out0: v11, out1: v8, out2: v12, out3: v10};
}, {v0: k.tensor([512], "f32"), v1: k.tensor([512, 512], "f32"), v2: k.tensor([1, 1, 1, 42], "f32"), v3: k.tensor([1, 42, 512], "f32"), v4: k.tensor([1, 42, 512], "f32"), v5: k.tensor([1, 8, 1, 64], "f32")});
