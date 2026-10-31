project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.add(v2, v3);
const v5 = N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v4, "f32"), [144, 1024]), N.reshape(N.cast(v1, "f32"), [1024]), N.reshape(N.cast(v0, "f32"), [1024]), {"eps": 1e-05}), [1, 144, 1024]), "f32");
const v6 = N.transpose(v5, 1, 2);
return {out0: v5, out1: v6};
}, {v0: k.tensor([1024], "f32"), v1: k.tensor([1024], "f32"), v2: k.tensor([1, 144, 1024], "f32"), v3: k.tensor([1, 144, 1024], "f32")});
