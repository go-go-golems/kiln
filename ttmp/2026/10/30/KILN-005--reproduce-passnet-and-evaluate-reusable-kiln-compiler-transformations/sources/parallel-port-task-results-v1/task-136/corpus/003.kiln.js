project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.cast(N.linear(N.cast(v0, "f32"), N.cast(v1, "f32"), N.cast(v2, "f32")), "bf16");
const v5 = N.reshape(v4, [1, 16, 199, 2, 4]);
const v6 = N.cast(N.reshape(N.sum(N.cast(v5, "f32"), 4, true), [1, 16, 199, 2]), "bf16");
const v7 = N.cast(N.sigmoid(N.cast(v6, "f32")), "bf16");
const v8_0 = N.slice(v7, 3, 0, 1);
const v8_1 = N.slice(v7, 3, 1, 2);
const v9 = v8_0;
const v10 = v8_1;
const v11 = N.mul(v10, v3);
const v12 = N.sub(v11, 1.0);
const v13 = N.mul(v9, v12);
const v14 = N.add(v13, 2.0);
const v15 = N.reshape(v14, [1, 16, 199, 1]);
return {out0: v15};
}, {v0: k.tensor([1, 16, 199, 64], "bf16"), v1: k.tensor([8, 64], "bf16"), v2: k.tensor([8], "bf16"), v3: k.tensor([1, 16, 1, 1], "bf16")});
