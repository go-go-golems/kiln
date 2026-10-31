project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.add(v3, v2);
const v5 = N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v4, "f32"), [256, 512]), N.reshape(N.cast(v1, "f32"), [512]), N.reshape(N.cast(v0, "f32"), [512]), {"eps": 1e-05}), [1, 256, 512]), "f32");
const v6 = N.transpose(v5, 0, 1);
const v7 = N.transpose(v5, 0, 1);
return {out0: v4, out1: v7, out2: v6};
}, {v0: k.tensor([512], "f32"), v1: k.tensor([512], "f32"), v2: k.tensor([1, 256, 512], "f32"), v3: k.tensor([1, 256, 512], "f32")});
