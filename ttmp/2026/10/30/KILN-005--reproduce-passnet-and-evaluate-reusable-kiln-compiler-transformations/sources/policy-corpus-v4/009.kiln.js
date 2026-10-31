project("passnet").program(({v0, v1}) => {
const v2 = N.add(v1, v0);
const v3 = N.transpose(v2, 1, 2);
const v4 = N.reshape(v3, [1, 768, 16, 16]);
return {out0: v4};
}, {v0: k.tensor([1, 256, 768], "f32"), v1: k.tensor([1, 256, 768], "f32")});
