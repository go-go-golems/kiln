project("passnet").program(({v0, v1, v2}) => {
const v3 = N.cast(N.linear(N.cast(v2, "f32"), N.cast(v1, "f32"), N.cast(v0, "f32")), "f32");
const v4 = N.reshape(v3, [1, 18, 16, 64]);
return {out0: v4};
}, {v0: k.tensor([1024], "f32"), v1: k.tensor([1024, 1024], "f32"), v2: k.tensor([1, 18, 1024], "f32")});
