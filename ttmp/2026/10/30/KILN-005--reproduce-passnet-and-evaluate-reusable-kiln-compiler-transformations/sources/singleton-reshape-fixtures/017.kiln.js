project("passnet").program(({v0}) => {
const v1 = N.transpose(v0, 0, 1);
const v2 = N.reshape(v1, [1, 3, 2, 1]);
return {out0: v2};
}, {v0: k.tensor([2, 3], "bf16")});
