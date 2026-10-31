project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.reshape(v3, [1, 8, 2, 8, 2, 16]);
const v5 = N.reshape(v4, [1, 16, 16, 16]);
const v6 = N.reshape(v5, [1, 256, 16]);
const v7 = N.add(v2, v6);
const v8 = N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v7, "f32"), [256, 16]), N.reshape(N.cast(v1, "f32"), [16]), N.reshape(N.cast(v0, "f32"), [16]), {"eps": 1e-05}), [1, 256, 16]), "f32");
return {out0: v7, out1: v8};
}, {v0: k.tensor([16], "f32"), v1: k.tensor([16], "f32"), v2: k.tensor([1, 256, 16], "f32"), v3: k.tensor([1, 8, 2, 8, 2, 16], "f32")});
