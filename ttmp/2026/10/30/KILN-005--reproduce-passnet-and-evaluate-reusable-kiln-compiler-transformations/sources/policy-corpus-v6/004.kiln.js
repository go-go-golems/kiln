project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.add(v3, v2);
const v5 = N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v4, "f32"), [4, 128]), N.reshape(N.cast(v1, "f32"), [128]), N.reshape(N.cast(v0, "f32"), [128]), {"eps": 1e-05}), [1, 4, 128]), "f32");
const v6 = N.reshape(v5, [1, 2, 2, 128]);
const v7 = N.transpose(N.transpose(v6, 1, 3), 2, 3);
const v8 = N.reshape(v7, [1, 128, 2, 2]);
return {out0: v8};
}, {v0: k.tensor([128], "f32"), v1: k.tensor([128], "f32"), v2: k.tensor([1, 4, 128], "f32"), v3: k.tensor([1, 4, 128], "f32")});
