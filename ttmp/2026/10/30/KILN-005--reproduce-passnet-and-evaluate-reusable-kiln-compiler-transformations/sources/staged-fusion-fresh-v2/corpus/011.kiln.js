project("passnet").program(({v0, v1, v2, v3, v4, v5}) => {
const v6 = N.add(v4, v5);
const v7 = N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v6, "f32"), [15, 256]), N.reshape(N.cast(v3, "f32"), [256]), N.reshape(N.cast(v2, "f32"), [256]), {"eps": 1e-05}), [1, 15, 256]), "f32");
const v8 = N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v7, "f32"), [15, 256]), N.reshape(N.cast(v1, "f32"), [256]), N.reshape(N.cast(v0, "f32"), [256]), {"eps": 1e-05}), [1, 15, 256]), "f32");
return {out0: v8};
}, {v0: k.tensor([256], "f32"), v1: k.tensor([256], "f32"), v2: k.tensor([256], "f32"), v3: k.tensor([256], "f32"), v4: k.tensor([1, 15, 256], "f32"), v5: k.tensor([1, 15, 256], "f32")});
