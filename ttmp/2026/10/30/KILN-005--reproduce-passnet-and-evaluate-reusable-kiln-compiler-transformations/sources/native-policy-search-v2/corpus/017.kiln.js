project("passnet").program(({v0, v1}) => {
const v2 = N.cast(N.matmul(N.cast(v1, "f32"), N.cast(v0, "f32")), "f32");
const v3 = N.transpose(N.transpose(v2, 1, 3), 2, 3);
const v4 = N.transpose(N.transpose(v1, 1, 3), 2, 3);
const v5 = N.reshape(v3, [1, 20, 20, 256]);
const v6 = N.transpose(N.transpose(v5, 1, 3), 2, 3);
const v7 = N.reshape(v6, [1, 256, 20, 20]);
return {out0: v4, out1: v7};
}, {v0: k.tensor([1, 8, 400, 400], "f32"), v1: k.tensor([1, 8, 32, 400], "f32")});
