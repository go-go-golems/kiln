project("passnet").program(({v0}) => {
const v1 = N.reshape(v0, [960, 4, 2, 2]);
const v2 = N.transpose(v1, 1, 2);
const v3 = N.reshape(v2, [1, 240, 8, 8]);
return {out0: v3};
}, {v0: k.tensor([1, 240, 16, 4], "f32")});
