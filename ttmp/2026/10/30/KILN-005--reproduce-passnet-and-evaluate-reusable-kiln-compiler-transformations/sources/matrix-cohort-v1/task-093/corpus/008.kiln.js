project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.cast(N.linear(N.cast(v0, "f32"), N.cast(v1, "f32"), N.cast(v2, "f32")), "f32");
const v5 = N.cast(N.reshape(N.mul(N.sum(N.cast(v3, "f32"), 1, true), 0.02040816326530612), [512, 448]), "f32");
return {out0: v4, out1: v5};
}, {v0: k.tensor([512, 448], "f32"), v1: k.tensor([2, 448], "f32"), v2: k.tensor([2], "f32"), v3: k.tensor([512, 49, 448], "f32")});
