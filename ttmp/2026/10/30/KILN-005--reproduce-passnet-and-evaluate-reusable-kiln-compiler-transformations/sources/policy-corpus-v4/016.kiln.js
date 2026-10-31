project("passnet").program(({v0, v1, v2}) => {
const v3 = N.mul(v2, v0);
const v4 = N.add(v1, v3);
return {out0: v4};
}, {v0: k.tensor([1, 49, 448], "f32"), v1: k.tensor([1, 49, 448], "f32"), v2: k.tensor([1, 1, 448], "f32")});
