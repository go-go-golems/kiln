project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.reshape(v0, [1, 5, 7, 5, 7, 384]);
const v5 = N.reshape(v4, [1, 35, 35, 384]);
const v6 = N.roll(v5, [3, 3], [1, 2]);
const v7 = N.reshape(N.slice(N.slice(v6, 1, 0, 32), 2, 0, 32), [1, 32, 32, 384]);
const v8 = N.reshape(v7, [1, 32, 32, 384]);
const v9 = N.reshape(v8, [1, 1024, 384]);
const v10 = N.add(v1, v9);
const v11 = N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v10, "f32"), [1024, 384]), N.reshape(N.cast(v2, "f32"), [384]), N.reshape(N.cast(v3, "f32"), [384]), {"eps": 1e-05}), [1, 1024, 384]), "f16");
return {out0: v10, out1: v11};
}, {v0: k.tensor([1, 5, 7, 5, 7, 384], "f16"), v1: k.tensor([1, 1024, 384], "f16"), v2: k.tensor([384], "f16"), v3: k.tensor([384], "f16")});
