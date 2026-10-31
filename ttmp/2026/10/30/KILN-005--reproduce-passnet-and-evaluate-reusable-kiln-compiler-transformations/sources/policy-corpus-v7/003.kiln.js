project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.add(v3, v2);
const v5 = N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v4, "f32"), [192, 768]), N.reshape(N.cast(v1, "f32"), [768]), N.reshape(N.cast(v0, "f32"), [768]), {"eps": 1e-06}), [1, 192, 768]), "f32");
const v6 = N.reshape(v5, [1, 192, 768]);
const v7 = N.reshape(v6, [1, 16, 12, 768]);
const v8 = N.transpose(N.transpose(v7, 1, 3), 2, 3);
const v9 = N.relu(v8);
return {out0: v9};
}, {v0: k.tensor([768], "f32"), v1: k.tensor([768], "f32"), v2: k.tensor([1, 192, 768], "f32"), v3: k.tensor([1, 192, 768], "f32")});
