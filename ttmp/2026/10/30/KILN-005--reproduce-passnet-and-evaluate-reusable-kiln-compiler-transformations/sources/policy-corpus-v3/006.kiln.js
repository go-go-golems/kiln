project("passnet").program(({v0}) => {
const v1 = N.reshape(v0, [8, 256, 12, 64]);
const v2 = N.reshape(v1, [8, 256, 768]);
const v3 = N.reshape(v2, [8, 256, 768]);
return {out0: v3};
}, {v0: k.tensor([8, 256, 12, 64], "f32")});
