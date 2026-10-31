project("passnet").program(({v0}) => {
const v1 = N.reshape(v0, [1, 35, 28, 64]);
const v2 = N.reshape(N.slice(N.slice(v1, 1, 1, 33), 2, 2, 26), [1, 32, 24, 64]);
const v3 = N.reshape(v2, [1, 768, 64]);
return {out0: v3};
}, {v0: k.tensor([1, 5, 7, 4, 7, 64], "f32")});
