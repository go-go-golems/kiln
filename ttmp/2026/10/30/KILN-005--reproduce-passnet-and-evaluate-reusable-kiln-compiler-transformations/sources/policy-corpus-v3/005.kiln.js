project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.resizeBilinear(v3, [64, 64]);
const v5 = N.concat([v0, v1, v2, v4], 1);
return {out0: v5};
}, {v0: k.tensor([1, 18, 64, 64], "f32"), v1: k.tensor([1, 36, 64, 64], "f32"), v2: k.tensor([1, 72, 64, 64], "f32"), v3: k.tensor([1, 144, 8, 8], "f32")});
