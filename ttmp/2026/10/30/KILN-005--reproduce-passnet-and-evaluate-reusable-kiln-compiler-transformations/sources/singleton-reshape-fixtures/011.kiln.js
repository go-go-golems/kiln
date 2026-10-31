project("passnet").program(({v0}) => {
const v1 = N.transpose(v0, 0, 1);
const v2 = N.reshape(v1, [6]);
return {out0: v2};
}, {v0: k.tensor([2, 3], "f16")});
