project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.add(v2, v3);
const v5 = N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v4, "f32"), [257, 1664]), N.reshape(N.cast(v1, "f32"), [1664]), N.reshape(N.cast(v0, "f32"), [1664]), {"eps": 1e-05}), [1, 257, 1664]), "f32");
return {out0: v4, out1: v5};
}, {v0: k.tensor([1664], "f32"), v1: k.tensor([1664], "f32"), v2: k.tensor([1, 257, 1664], "f32"), v3: k.tensor([1, 257, 1664], "f32")});
