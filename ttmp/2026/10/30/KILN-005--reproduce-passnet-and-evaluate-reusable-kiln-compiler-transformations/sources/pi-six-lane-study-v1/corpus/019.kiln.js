project("passnet").program(({v0, v1, v2}) => {
const v3 = N.cast(N.gelu(N.cast(v2, "f32"), "none"), "f32");
const v4 = v3;
const v5 = N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v4, "f32"), [197, 4096]), N.reshape(N.cast(v1, "f32"), [4096]), N.reshape(N.cast(v0, "f32"), [4096]), {"eps": 1e-05}), [1, 197, 4096]), "f32");
return {out0: v5};
}, {v0: k.tensor([4096], "f32"), v1: k.tensor([4096], "f32"), v2: k.tensor([1, 197, 4096], "f32")});
