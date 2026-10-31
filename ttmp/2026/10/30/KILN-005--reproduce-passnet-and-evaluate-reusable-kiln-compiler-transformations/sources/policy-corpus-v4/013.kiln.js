project("passnet").program(({v0}) => {
const v1 = N.reshape(v0, [2, 7, 16, 64]);
const v2 = N.reshape(v1, [2, 7, 1024]);
const v3 = N.reshape(v2, [2, 7, 1024]);
return {out0: v3};
}, {v0: k.tensor([2, 7, 16, 64], "f32")});
