project("passnet").program(({v0, v1, v2, v3, v4, v5, v6, v7, v8, v9, v10, v11}) => {
const v12 = N.cast(N.linear(N.cast(v0, "f32"), N.cast(v1, "f32"), N.cast(v2, "f32")), "bf16");
const v13 = N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v12, "f32"), [300, 256]), N.reshape(N.cast(v3, "f32"), [256]), N.reshape(N.cast(v4, "f32"), [256]), {"eps": 1e-05}), [300, 1, 256]), "bf16");
const v14 = N.cast(N.sigmoid(N.cast(v5, "f32")), "bf16");
const v15 = N.cast(N.sigmoid(N.cast(v13, "f32")), "bf16");
const v16 = N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v6, "f32"), [300, 256]), N.reshape(N.cast(v7, "f32"), [256]), N.reshape(N.cast(v8, "f32"), [256]), {"eps": 1e-05}), [300, 256]), "bf16");
const v17 = N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v9, "f32"), [300, 256]), N.reshape(N.cast(v10, "f32"), [256]), N.reshape(N.cast(v11, "f32"), [256]), {"eps": 1e-05}), [300, 1, 256]), "bf16");
const v18 = N.reshape(v16, [300, 1, 256]);
const v19 = N.mul(v15, v18);
const v20 = N.mul(v14, v17);
const v21 = N.add(v19, v20);
return {out0: v21};
}, {v0: k.tensor([300, 1, 256], "bf16"), v1: k.tensor([256, 256], "bf16"), v2: k.tensor([256], "bf16"), v3: k.tensor([256], "bf16"), v4: k.tensor([256], "bf16"), v5: k.tensor([300, 1, 256], "bf16"), v6: k.tensor([300, 256], "bf16"), v7: k.tensor([256], "bf16"), v8: k.tensor([256], "bf16"), v9: k.tensor([300, 1, 256], "bf16"), v10: k.tensor([256], "bf16"), v11: k.tensor([256], "bf16")});
