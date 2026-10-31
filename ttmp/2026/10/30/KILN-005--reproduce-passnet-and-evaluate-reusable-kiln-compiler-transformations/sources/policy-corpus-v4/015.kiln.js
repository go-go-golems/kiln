project("passnet").program(({v0}) => {
const v1 = N.reshape(v0, [1, 4, 4, 2, 2, 32]);
const v2 = N.reshape(v1, [16, 2, 2, 32]);
const v3 = N.reshape(v2, [16, 4, 32]);
return {out0: v3};
}, {v0: k.tensor([1, 4, 4, 2, 2, 32], "f32")});
