project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.add(v2, v3);
const v5 = N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v4, "f32"), [3072, 384]), N.reshape(N.cast(v1, "f32"), [384]), N.reshape(N.cast(v0, "f32"), [384]), {"eps": 1e-06}), [16, 192, 384]), "f32");
return {out0: v5, out1: v4};
}, {v0: k.tensor([384], "f32"), v1: k.tensor([384], "f32"), v2: k.tensor([16, 192, 384], "f32"), v3: k.tensor([16, 192, 384], "f32")});
