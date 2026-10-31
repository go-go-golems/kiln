project("passnet").program(({v0, v1, v2}) => {
const v3 = N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v2, "f32"), [249, 768]), N.reshape(N.cast(v1, "f32"), [768]), N.reshape(N.cast(v0, "f32"), [768]), {"eps": 1e-05}), [1, 249, 768]), "f32");
const v4 = v3;
return {out0: v4};
}, {v0: k.tensor([768], "f32"), v1: k.tensor([768], "f32"), v2: k.tensor([1, 249, 768], "f32")});
