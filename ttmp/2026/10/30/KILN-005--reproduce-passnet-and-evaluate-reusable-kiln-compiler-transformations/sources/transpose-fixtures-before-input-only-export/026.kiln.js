project("passnet").program(({v0}) => {
const v1 = N.transpose(v0, 2, 0);
return {out0: v1};
}, {v0: k.tensor([2, 3, 4], "bf16")});
