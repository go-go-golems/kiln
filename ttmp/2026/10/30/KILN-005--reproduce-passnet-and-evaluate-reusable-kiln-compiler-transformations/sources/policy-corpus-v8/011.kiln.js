project("passnet").program(({v0, v1, v2, v3, v4}) => {
const v5 = N.add(v3, v2);
const v6 = N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v5, "f32"), [256, 256]), N.reshape(N.cast(v1, "f32"), [256]), N.reshape(N.cast(v0, "f32"), [256]), {"eps": 1e-05}), [1, 256, 256]), "f32");
const v7 = N.reshape(v6, [1, 16, 16, 256]);
const v8 = N.transpose(N.transpose(v7, 1, 3), 2, 3);
const v9 = N.reshape(v8, [1, 256, 16, 16]);
const v10 = N.reshape(v4, [1, 32, 16384]);
const v11 = N.transpose(v10, 1, 2);
return {out0: v9, out1: v11};
}, {v0: k.tensor([256], "f32"), v1: k.tensor([256], "f32"), v2: k.tensor([1, 256, 256], "f32"), v3: k.tensor([1, 256, 256], "f32"), v4: k.tensor([1, 32, 128, 128], "f32")});
