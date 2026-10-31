project("passnet").program(({v0, v1, v2}) => {
const v3 = N.mul(v0, v1);
const v4 = N.cast(v3, "f32");
const v5 = N.cast(N.square(N.cast(v4, "f32")), "f32");
const v6 = N.cast(N.mul(N.sum(N.cast(v5, "f32"), 2, true), 0.00048828125), "f32");
const v7 = N.add(v6, 1e-06);
const v8 = N.rsqrt(v7);
const v9 = N.mul(v4, v8);
const v10 = N.cast(v2, "f32");
const v11 = N.add(1.0, v10);
const v12 = N.mul(v9, v11);
const v13 = N.cast(v12, "bf16");
return {out0: v3, out1: v13};
}, {v0: k.tensor([1, 3, 2048], "bf16"), v1: k.tensor([], "bf16"), v2: k.tensor([2048], "bf16")});
