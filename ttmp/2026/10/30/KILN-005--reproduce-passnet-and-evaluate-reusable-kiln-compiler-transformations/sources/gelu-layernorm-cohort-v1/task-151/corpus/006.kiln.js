project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.cast(N.gelu(N.cast(v0, "f32"), "none"), "bf16");
const v5 = N.reshape(v4, [1, 256, 48]);
const v6 = N.transpose(v5, 1, 2);
const v7 = N.reshape(v6, [1, 48, 256]);
const v8 = N.add(v1, v7);
const v9 = N.transpose(v8, 1, 2);
const v10 = N.reshape(v9, [1, 256, 8, 6]);
const v11 = N.reshape(v10, [1, 256, 48]);
const v12 = N.transpose(v11, 1, 2);
const v13 = N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v12, "f32"), [48, 256]), N.reshape(N.cast(v2, "f32"), [256]), N.reshape(N.cast(v3, "f32"), [256]), {"eps": 1e-06}), [1, 48, 256]), "bf16");
const v14 = N.reshape(v13, [1, 8, 6, 256]);
return {out0: v12, out1: v14};
}, {v0: k.tensor([1, 256, 8, 6], "bf16"), v1: k.tensor([1, 48, 256], "bf16"), v2: k.tensor([256], "bf16"), v3: k.tensor([256], "bf16")});
