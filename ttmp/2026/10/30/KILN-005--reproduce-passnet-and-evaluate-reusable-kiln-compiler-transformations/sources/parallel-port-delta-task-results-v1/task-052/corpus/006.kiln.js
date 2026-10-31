project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.cast(N.linear(N.cast(v0, "f32"), N.cast(v1, "f32"), N.cast(v2, "f32")), "f16");
const v5 = N.reshape(v4, [256, 49, 8, 192]);
const v6_0 = N.slice(v5, 3, 0, 32);
const v6_1 = N.slice(v5, 3, 32, 64);
const v6_2 = N.slice(v5, 3, 64, 192);
const v7 = v6_0;
const v8 = v6_1;
const v9 = v6_2;
const v10 = N.transpose(v7, 1, 2);
const v11 = N.transpose(v8, 1, 2);
const v12 = N.transpose(v9, 1, 2);
const v13 = v3;
const v14 = N.transpose(v11, 2, 3);
return {out0: v10, out1: v13, out2: v14, out3: v12};
}, {v0: k.tensor([256, 49, 448], "f16"), v1: k.tensor([1536, 448], "f16"), v2: k.tensor([1536], "f16"), v3: k.tensor([8, 49, 49], "f16")});
