project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.cast(N.linear(N.cast(v2, "f32"), N.cast(v1, "f32"), N.cast(v0, "f32")), "f32");
const v5 = N.reshape(v4, [64, 128, 4, 8]);
const v6 = N.transpose(v5, 1, 2);
const v7 = N.transpose(v3, -1, -2);
return {out0: v7, out1: v6};
}, {v0: k.tensor([32], "f32"), v1: k.tensor([32, 32], "f32"), v2: k.tensor([64, 128, 32], "f32"), v3: k.tensor([64, 4, 128, 8], "f32")});
