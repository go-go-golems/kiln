project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.add(v3, v2);
const v5 = N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v4, "f32"), [2048, 768]), N.reshape(N.cast(v1, "f32"), [768]), N.reshape(N.cast(v0, "f32"), [768]), {"eps": 1e-12}), [16, 128, 768]), "f32");
return {out0: v5};
}, {v0: k.tensor([768], "f32"), v1: k.tensor([768], "f32"), v2: k.tensor([16, 128, 768], "f32"), v3: k.tensor([16, 128, 768], "f32")});
