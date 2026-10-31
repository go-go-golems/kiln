project("passnet").program(({v0}) => {
const v1 = N.reshape(N.slice(N.slice(v0, 1, 1, 4), 2, 2, 3), [2, 3, 1]);
const v2 = N.reshape(N.slice(v0, 2, 1, 2), [2, 5, 1]);
const v3 = N.reshape(N.slice(v0, 0, 1, 2), [5, 4]);
return {out0: v1, out1: v2, out2: v3};
}, {v0: k.tensor([2, 5, 4], "f32")});
