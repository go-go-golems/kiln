project("passnet").program(({v0, v1, v2, v3, v4, v5}) => {
const v6 = N.concat([v2, v5, v3], 2);
const v7 = N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v4, "f32"), [1125, 384]), N.reshape(N.cast(v1, "f32"), [384]), N.reshape(N.cast(v0, "f32"), [384]), {"eps": 1e-12}), [1, 1125, 384]), "f32");
return {out0: v7, out1: v6};
}, {v0: k.tensor([384], "f32"), v1: k.tensor([384], "f32"), v2: k.tensor([11, 1, 1, 384], "f32"), v3: k.tensor([11, 1, 100, 384], "f32"), v4: k.tensor([1, 1125, 384], "f32"), v5: k.tensor([11, 1, 1024, 384], "f32")});
