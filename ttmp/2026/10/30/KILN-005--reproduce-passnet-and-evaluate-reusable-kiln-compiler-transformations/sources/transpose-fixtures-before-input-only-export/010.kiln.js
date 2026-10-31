project("passnet").program(({v0}) => {
const v1 = N.transpose(v0, 0, 0);
return {out0: v1};
}, {v0: k.tensor([5], "f32")});
