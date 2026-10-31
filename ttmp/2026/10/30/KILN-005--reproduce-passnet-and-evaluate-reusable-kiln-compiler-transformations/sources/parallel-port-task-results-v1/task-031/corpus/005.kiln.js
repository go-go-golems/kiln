project("passnet").program(({v0, v1, v2}) => {
const v3 = N.cast(N.matmul(N.cast(v0, "f32"), N.cast(v1, "f32")), "f16");
const v4 = N.reshape(N.slice(v0, 2, 1, 2305), [1, 8, 2304, 32]);
const v5 = N.reshape(N.slice(v2, 2, 1, 2305), [1, 8, 2304, 32]);
const v6 = N.transpose(v5, 3, 2);
const v7 = N.reshape(v6, [1, 256, 48, 48]);
const v8_0 = N.slice(v7, 1, 0, 64);
const v8_1 = N.slice(v7, 1, 64, 160);
const v8_2 = N.slice(v7, 1, 160, 256);
const v9 = v8_0;
const v10 = v8_1;
const v11 = v8_2;
return {out0: v3, out1: v9, out2: v10, out3: v11, out4: v4};
}, {v0: k.tensor([1, 8, 2305, 32], "f16"), v1: k.tensor([1, 8, 32, 32], "f16"), v2: k.tensor([1, 8, 2305, 32], "f16")});
