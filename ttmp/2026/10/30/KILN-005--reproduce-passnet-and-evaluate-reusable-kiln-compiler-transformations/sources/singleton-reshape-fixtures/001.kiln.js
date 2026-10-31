project("passnet").program(({v0}) => {
const v1 = N.reshape(v0, []);
return {out0: v1};
}, {v0: k.tensor([1, 1], "f32")});
