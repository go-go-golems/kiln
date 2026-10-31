project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.add(v2, v3);
const v5 = N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v4, "f32"), [198, 192]), N.reshape(N.cast(v1, "f32"), [192]), N.reshape(N.cast(v0, "f32"), [192]), {"eps": 1e-06}), [1, 198, 192]), "f32");
const v6 = N.reshape(N.slice(v5, 1, 0, 1), [1, 192]);
const v7 = N.reshape(N.slice(v5, 1, 1, 2), [1, 192]);
return {out0: v6, out1: v7};
}, {v0: k.tensor([192], "f32"), v1: k.tensor([192], "f32"), v2: k.tensor([1, 198, 192], "f32"), v3: k.tensor([1, 198, 192], "f32")});
