project("passnet").program(({v0}) => {
const v1 = N.reshape(v0, [1, 8, 8, 8, 8, 384]);
const v2 = N.reshape(v1, [64, 8, 8, 384]);
const v3 = N.reshape(v2, [64, 64, 384]);
return {out0: v3};
}, {v0: k.tensor([1, 8, 8, 8, 8, 384], "f32")});
