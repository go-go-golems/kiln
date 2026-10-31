project("passnet").program(({v0, v1, v2, v3, v4}) => {
const v5 = N.resizeBilinear(v1, [16, 16]);
const v6 = N.concat([v0, v2, v3, v4, v5], 1);
return {out0: v6};
}, {v0: k.tensor([1, 768, 16, 16], "f32"), v1: k.tensor([1, 512, 6, 6], "f32"), v2: k.tensor([1, 512, 16, 16], "f32"), v3: k.tensor([1, 512, 16, 16], "f32"), v4: k.tensor([1, 512, 16, 16], "f32")});
