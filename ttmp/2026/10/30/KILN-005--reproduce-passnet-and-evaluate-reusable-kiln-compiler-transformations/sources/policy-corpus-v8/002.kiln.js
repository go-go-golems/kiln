project("passnet").program(({v0, v1, v2, v3, v4}) => {
const v5 = N.mul(v2, v4);
const v6 = N.add(v5, v3);
const v7 = N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v6, "f32"), [577, 1024]), N.reshape(N.cast(v1, "f32"), [1024]), N.reshape(N.cast(v0, "f32"), [1024]), {"eps": 1e-12}), [1, 577, 1024]), "f32");
return {out0: v7, out1: v6};
}, {v0: k.tensor([1024], "f32"), v1: k.tensor([1024], "f32"), v2: k.tensor([1024], "f32"), v3: k.tensor([1, 577, 1024], "f32"), v4: k.tensor([1, 577, 1024], "f32")});
