project("passnet").program(({v0, v1, v2}) => {
const v3 = N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v2, "f32"), [13, 2]), N.reshape(N.cast(v1, "f32"), [2]), N.reshape(N.cast(v0, "f32"), [2]), {"eps": 1e-12}), [1, 13, 2]), "f32");
const v4 = N.reshape(N.slice(v3, 1, 0, 1), [1, 2]);
return {out0: v4, out1: v3};
}, {v0: k.tensor([2], "f32"), v1: k.tensor([2], "f32"), v2: k.tensor([1, 13, 2], "f32")});
