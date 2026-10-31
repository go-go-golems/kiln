project("passnet").program(({v0, v1, v2, v3, v4}) => {
const v5 = N.sub(v0, v1);
const v6 = N.cast(N.square(N.cast(v5, "f32")), "f16");
const v7 = N.cast(N.reshape(N.sum(N.cast(v6, "f32"), 3, true), [1, 4096, 32]), "f16");
const v8 = N.mul(v2, v7);
const v9 = N.cast(N.softmax(N.cast(v8, "f32"), 2), "f16");
const v10 = N.reshape(v3, [1, 1, 32, 512]);
const v11 = N.reshape(v4, [1, 4096, 1, 512]);
const v12 = N.expand(v11, [1, 4096, 32, 512]);
const v13 = N.reshape(v9, [1, 4096, 32, 1]);
const v14 = N.sub(v12, v10);
return {out0: v14, out1: v13};
}, {v0: k.tensor([1, 4096, 32, 512], "f16"), v1: k.tensor([1, 1, 32, 512], "f16"), v2: k.tensor([1, 1, 32], "f16"), v3: k.tensor([32, 512], "f16"), v4: k.tensor([1, 4096, 512], "f16")});
