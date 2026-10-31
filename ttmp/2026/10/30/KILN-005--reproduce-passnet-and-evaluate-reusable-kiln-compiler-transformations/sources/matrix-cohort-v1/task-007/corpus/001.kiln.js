project("passnet").program(({v0, v1, v2, v3, v4, v5}) => {
const v6 = N.cast(N.linear(N.cast(v0, "f32"), N.cast(v1, "f32"), N.cast(v2, "f32")), "f16");
const v7 = N.reshape(v3, [1, 1, 8, 64]);
const v8 = N.transpose(v7, 1, 2);
const v9 = N.reshape(v6, [1, 1, 8, 64]);
const v10 = N.transpose(v9, 1, 2);
const v11 = N.reshape(N.slice(v4, 3, 0, 1), [1, 1, 1, 1]);
const v12 = N.reshape(v5, [1, 8, 1, 64]);
const v13 = N.reshape(v8, [1, 8, 1, 64]);
const v14 = N.reshape(v10, [1, 8, 1, 64]);
return {out0: v11, out1: v13, out2: v12, out3: v14};
}, {v0: k.tensor([1, 1, 512], "f16"), v1: k.tensor([512, 512], "f16"), v2: k.tensor([512], "f16"), v3: k.tensor([1, 1, 512], "f16"), v4: k.tensor([1, 1, 1, 2], "f16"), v5: k.tensor([1, 8, 1, 64], "f16")});
