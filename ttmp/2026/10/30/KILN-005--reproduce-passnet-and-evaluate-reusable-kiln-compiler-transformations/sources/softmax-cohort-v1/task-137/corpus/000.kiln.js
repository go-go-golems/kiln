project("passnet").program(({v0, v1}) => {
const v2 = N.cast(N.softmax(N.cast(v0, "f32"), 1), "f32");
const v3 = N.reshape(v2, [8, 256]);
const v4 = N.reshape(v3, [8, 256, 1, 1]);
const v5 = N.reshape(v4, [8, 2, 128, 1, 1]);
const v6 = N.mul(v5, v1);
const v7 = N.cast(N.reshape(N.sum(N.cast(v6, "f32"), 1, true), [8, 128, 120, 160]), "f32");
const v8 = N.reshape(v7, [8, 128, 120, 160]);
return {out0: v8};
}, {v0: k.tensor([8, 2, 1, 128], "f32"), v1: k.tensor([8, 2, 128, 120, 160], "f32")});
