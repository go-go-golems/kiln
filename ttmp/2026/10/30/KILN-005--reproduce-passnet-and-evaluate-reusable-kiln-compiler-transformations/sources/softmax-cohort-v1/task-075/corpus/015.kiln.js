project("passnet").program(({v0, v1, v2}) => {
const v3 = N.cast(N.matmul(N.cast(v0, "f32"), N.cast(v1, "f32")), "f32");
const v4 = N.div(v3, 6.928203230275509);
const v5 = N.cast(N.softmax(N.cast(v4, "f32"), 3), "f32");
const v6 = v5;
const v7 = N.cast(N.matmul(N.cast(v6, "f32"), N.cast(v2, "f32")), "f32");
const v8 = N.transpose(v7, 1, 2);
const v9 = N.reshape(v8, [4, 1, 4, 48]);
const v10 = N.reshape(v9, [4, 1, 192]);
return {out0: v10};
}, {v0: k.tensor([4, 4, 1, 48], "f32"), v1: k.tensor([4, 4, 48, 1], "f32"), v2: k.tensor([4, 4, 1, 48], "f32")});
