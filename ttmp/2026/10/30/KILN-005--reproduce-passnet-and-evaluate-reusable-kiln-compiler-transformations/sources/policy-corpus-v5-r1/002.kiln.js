project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.cast(N.linear(N.cast(v0, "f32"), N.cast(v2, "f32"), N.cast(v1, "f32")), "f32");
const v5 = N.reshape(v3, [1, 10, 16, 64]);
const v6 = N.transpose(v5, 1, 2);
const v7 = N.reshape(v4, [1, 10, 16, 64]);
const v8 = N.transpose(v7, 1, 2);
return {out0: v6, out1: v8};
}, {v0: k.tensor([1, 10, 1024], "f32"), v1: k.tensor([1024], "f32"), v2: k.tensor([1024, 1024], "f32"), v3: k.tensor([1, 10, 1024], "f32")});
