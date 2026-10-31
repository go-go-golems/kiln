project("passnet").program(({v0, v1, v2}) => {
const v3 = N.concat([v0, v0], -1);
const v4 = N.cast(N.cos(N.cast(v3, "f32")), "f16");
const v5 = N.mul(v4, 1.0);
const v6 = N.cast(N.sin(N.cast(v3, "f32")), "f16");
const v7 = N.mul(v6, 1.0);
const v8 = N.cast(v5, "bf16");
const v9 = N.cast(v7, "bf16");
const v10 = N.cast(v1, "f32");
const v11 = N.cast(N.square(N.cast(v10, "f32")), "f32");
const v12 = N.cast(N.mul(N.sum(N.cast(v11, "f32"), 2, true), 0.00048828125), "f32");
const v13 = N.add(v12, 1e-06);
const v14 = N.rsqrt(v13);
const v15 = N.mul(v10, v14);
const v16 = N.cast(v15, "bf16");
const v17 = N.mul(v2, v16);
return {out0: v8, out1: v17, out2: v9};
}, {v0: k.tensor([1, 64, 64], "f16"), v1: k.tensor([1, 64, 2048], "bf16"), v2: k.tensor([2048], "bf16")});
