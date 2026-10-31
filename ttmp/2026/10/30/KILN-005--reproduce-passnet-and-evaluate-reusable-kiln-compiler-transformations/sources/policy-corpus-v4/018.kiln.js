project("passnet").program(({v0}) => {
const v1 = N.reshape(v0, [64, 144, 6, 32]);
const v2 = N.reshape(v1, [64, 144, 192]);
return {out0: v2};
}, {v0: k.tensor([64, 144, 6, 32], "f32")});
