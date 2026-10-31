project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.add(v3, v2);
const v5 = N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v4, "f32"), [198, 192]), N.reshape(N.cast(v1, "f32"), [192]), N.reshape(N.cast(v0, "f32"), [192]), {"eps": 1e-12}), [1, 198, 192]), "f32");
return {out0: v4, out1: v5};
}, {v0: k.tensor([192], "f32"), v1: k.tensor([192], "f32"), v2: k.tensor([1, 198, 192], "f32"), v3: k.tensor([1, 198, 192], "f32")});
