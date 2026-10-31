project("passnet").program(({v0, v1, v2}) => {
const v3 = N.mul(v2, v1);
const v4 = N.add(v3, v0);
return {out0: v4};
}, {v0: k.tensor([128], "f32"), v1: k.tensor([128], "f32"), v2: k.tensor([8, 256, 128], "f32")});
