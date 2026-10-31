project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.reshape(v0, [1, 4, 8, 4, 8, 768]);
const v5 = N.reshape(v4, [1, 32, 32, 768]);
const v6 = N.roll(v5, [4, 4], [1, 2]);
const v7 = N.reshape(v6, [1, 1024, 768]);
const v8 = N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v7, "f32"), [1024, 768]), N.reshape(N.cast(v1, "f32"), [768]), N.reshape(N.cast(v2, "f32"), [768]), {"eps": 1e-05}), [1, 1024, 768]), "f16");
const v9 = N.add(v3, v8);
return {out0: v9};
}, {v0: k.tensor([1, 4, 8, 4, 8, 768], "f16"), v1: k.tensor([768], "f16"), v2: k.tensor([768], "f16"), v3: k.tensor([1, 1024, 768], "f16")});
