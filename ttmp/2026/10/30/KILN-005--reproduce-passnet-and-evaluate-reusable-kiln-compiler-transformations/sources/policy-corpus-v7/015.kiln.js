project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.add(v2, v3);
const v5 = N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v4, "f32"), [8192, 32]), N.reshape(N.cast(v1, "f32"), [32]), N.reshape(N.cast(v0, "f32"), [32]), {"eps": 1e-12}), [64, 128, 32]), "f32");
return {out0: v5};
}, {v0: k.tensor([32], "f32"), v1: k.tensor([32], "f32"), v2: k.tensor([64, 128, 32], "f32"), v3: k.tensor([64, 128, 32], "f32")});
