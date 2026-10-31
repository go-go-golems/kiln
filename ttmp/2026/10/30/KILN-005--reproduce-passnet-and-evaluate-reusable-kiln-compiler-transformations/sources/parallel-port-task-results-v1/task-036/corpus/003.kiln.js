project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.reshape(v0, [1, 19, 7, 19, 7, 96]);
const v5 = N.reshape(v4, [1, 133, 133, 96]);
const v6 = N.roll(v5, [3, 3], [1, 2]);
const v7 = N.reshape(N.slice(N.slice(v6, 1, 0, 128), 2, 0, 128), [1, 128, 128, 96]);
const v8 = N.reshape(v7, [1, 128, 128, 96]);
const v9 = N.reshape(v8, [1, 16384, 96]);
const v10 = N.add(v1, v9);
const v11 = N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v10, "f32"), [16384, 96]), N.reshape(N.cast(v2, "f32"), [96]), N.reshape(N.cast(v3, "f32"), [96]), {"eps": 1e-05}), [1, 16384, 96]), "f32");
return {out0: v10, out1: v11};
}, {v0: k.tensor([1, 19, 7, 19, 7, 96], "f32"), v1: k.tensor([1, 16384, 96], "f32"), v2: k.tensor([96], "f32"), v3: k.tensor([96], "f32")});
