project("passnet").program(({v0, v1, v2, v3, v4}) => {
const v5 = N.add(v2, v3);
const v6 = N.add(v5, v4);
const v7 = N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v6, "f32"), [2, 2048]), N.reshape(N.cast(v1, "f32"), [2048]), N.reshape(N.cast(v0, "f32"), [2048]), {"eps": 1e-05}), [1, 2, 2048]), "f32");
return {out0: v6, out1: v7};
}, {v0: k.tensor([2048], "f32"), v1: k.tensor([2048], "f32"), v2: k.tensor([1, 2, 2048], "f32"), v3: k.tensor([1, 2, 2048], "f32"), v4: k.tensor([1, 2, 2048], "f32")});
