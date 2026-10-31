project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.cast(N.linear(N.cast(v2, "f32"), N.cast(v1, "f32"), N.cast(v0, "f32")), "f32");
const v5 = N.reshape(N.slice(v3, 1, 1, 2), [1, 768]);
return {out0: v4, out1: v5};
}, {v0: k.tensor([1000], "f32"), v1: k.tensor([1000, 768], "f32"), v2: k.tensor([1, 768], "f32"), v3: k.tensor([1, 198, 768], "f32")});
