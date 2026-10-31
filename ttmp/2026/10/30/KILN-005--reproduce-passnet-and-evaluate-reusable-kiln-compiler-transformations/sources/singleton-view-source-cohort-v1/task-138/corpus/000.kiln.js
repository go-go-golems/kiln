project("passnet").program(({v0}) => {
const v1 = N.reshape(v0, [1, 1, 1024, 128]);
const v2 = N.transpose(v1, 2, 3);
return {out0: v2};
}, {v0: k.tensor([1, 1024, 128], "f16")});
