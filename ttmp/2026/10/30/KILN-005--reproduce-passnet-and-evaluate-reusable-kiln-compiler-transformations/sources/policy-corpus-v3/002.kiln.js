project("passnet").program(({v0}) => {
const v1 = N.transpose(v0, 1, 2);
const v2 = N.reshape(v1, [1, 1024, 16, 16]);
return {out0: v2};
}, {v0: k.tensor([1, 256, 1024], "f32")});
