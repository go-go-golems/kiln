project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.cast(N.gelu(N.cast(v0, "f32"), "none"), "bf16");
const v5 = N.reshape(v4, [1, 32, 3072]);
const v6 = N.transpose(v5, 1, 2);
const v7 = N.reshape(v6, [1, 3072, 32]);
const v8 = N.add(v1, v7);
const v9 = N.transpose(v8, 1, 2);
const v10 = N.reshape(v9, [1, 32, 64, 48]);
const v11 = N.reshape(v10, [1, 32, 3072]);
const v12 = N.transpose(v11, 1, 2);
const v13 = N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v12, "f32"), [3072, 32]), N.reshape(N.cast(v2, "f32"), [32]), N.reshape(N.cast(v3, "f32"), [32]), {"eps": 1e-06}), [1, 3072, 32]), "bf16");
const v14 = N.reshape(v13, [1, 64, 48, 32]);
return {out0: v12, out1: v14};
}, {v0: k.tensor([1, 32, 64, 48], "bf16"), v1: k.tensor([1, 3072, 32], "bf16"), v2: k.tensor([32], "bf16"), v3: k.tensor([32], "bf16")});
