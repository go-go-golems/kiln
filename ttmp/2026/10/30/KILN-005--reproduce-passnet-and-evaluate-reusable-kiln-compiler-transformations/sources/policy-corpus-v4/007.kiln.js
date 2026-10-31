project("passnet").program(({v0}) => {
const v1 = N.reshape(v0, [1, 22, 8, 64]);
const v2 = N.transpose(v1, 1, 2);
return {out0: v2};
}, {v0: k.tensor([1, 22, 512], "f32")});
