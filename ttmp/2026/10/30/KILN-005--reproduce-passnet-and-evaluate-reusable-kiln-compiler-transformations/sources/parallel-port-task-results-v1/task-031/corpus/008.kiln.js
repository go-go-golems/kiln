project("passnet").program(({v0, v1, v2}) => {
const v3 = N.cast(N.matmul(N.cast(v0, "f32"), N.cast(v1, "f32")), "f32");
const v4 = N.reshape(N.slice(v0, 2, 1, 50), [1, 8, 49, 27]);
const v5 = N.reshape(N.slice(v2, 2, 1, 50), [1, 8, 49, 27]);
const v6 = N.transpose(v5, 3, 2);
const v7 = N.reshape(v6, [1, 216, 7, 7]);
const v8_0 = N.slice(v7, 1, 0, 54);
const v8_1 = N.slice(v7, 1, 54, 135);
const v8_2 = N.slice(v7, 1, 135, 216);
const v9 = v8_0;
const v10 = v8_1;
const v11 = v8_2;
return {out0: v3, out1: v9, out2: v10, out3: v11, out4: v4};
}, {v0: k.tensor([1, 8, 50, 27], "f32"), v1: k.tensor([1, 8, 27, 27], "f32"), v2: k.tensor([1, 8, 50, 27], "f32")});
