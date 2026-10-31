project("passnet").program(({v0, v1, v2}) => {
const v3 = N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v0, "f32"), [3999, 512]), N.reshape(N.cast(v2, "f32"), [512]), N.reshape(N.cast(v1, "f32"), [512]), {"eps": 1e-05}), [1, 3999, 512]), "bf16");
const v4 = N.transpose(v3, 1, 2);
const v5 = N.cast(N.gelu(N.cast(v4, "f32"), "none"), "bf16");
return {out0: v5};
}, {v0: k.tensor([1, 3999, 512], "bf16"), v1: k.tensor([512], "bf16"), v2: k.tensor([512], "bf16")});
