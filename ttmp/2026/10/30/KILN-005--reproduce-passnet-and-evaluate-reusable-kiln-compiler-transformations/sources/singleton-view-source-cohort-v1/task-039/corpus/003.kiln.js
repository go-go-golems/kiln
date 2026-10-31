project("passnet").program(({v0, v1}) => {
const v2 = N.mul(v0, v1);
const v3 = N.cast(N.reshape(N.sum(N.cast(v2, "f32"), 1, true), [1, 64, 64]), "f32");
const v4 = N.reshape(v3, [1, 1, 64, 64]);
const v5 = N.cast(N.sigmoid(N.cast(v4, "f32")), "f32");
return {out0: v5};
}, {v0: k.tensor([1, 64, 64, 64], "f32"), v1: k.tensor([1, 64, 64, 64], "f32")});
