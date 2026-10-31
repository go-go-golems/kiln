project("passnet").program(({v0, v1, v2, v3, v4}) => {
const v5 = N.add(v2, v3);
const v6 = N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v5, "f32"), [625, 256]), N.reshape(N.cast(v1, "f32"), [256]), N.reshape(N.cast(v0, "f32"), [256]), {"eps": 1e-05}), [1, 625, 256]), "f32");
const v7 = N.add(v6, v4);
return {out0: v5, out1: v6, out2: v7};
}, {v0: k.tensor([256], "f32"), v1: k.tensor([256], "f32"), v2: k.tensor([1, 625, 256], "f32"), v3: k.tensor([1, 625, 256], "f32"), v4: k.tensor([1, 625, 256], "f32")});
