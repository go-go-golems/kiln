project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.add(v0, v1);
const v5 = N.cast(v4, "f32");
const v6 = N.cast(N.mul(N.sum(N.cast(v5, "f32"), 2, true), 0.0013020833333333333), "f32");
const v7 = N.sub(v5, v6);
const v8 = N.cast(N.square(N.cast(v7, "f32")), "f32");
const v9 = N.cast(N.mul(N.sum(N.cast(v8, "f32"), 2, true), 0.0013020833333333333), "f32");
const v10 = N.sub(v5, v6);
const v11 = N.add(v9, 1e-07);
const v12 = N.sqrt(v11);
const v13 = N.div(v10, v12);
const v14 = N.cast(v13, "f32");
const v15 = N.mul(v2, v14);
const v16 = N.add(v15, v3);
return {out0: v16};
}, {v0: k.tensor([32, 64, 768], "f16"), v1: k.tensor([32, 64, 768], "f16"), v2: k.tensor([768], "f16"), v3: k.tensor([768], "f16")});
