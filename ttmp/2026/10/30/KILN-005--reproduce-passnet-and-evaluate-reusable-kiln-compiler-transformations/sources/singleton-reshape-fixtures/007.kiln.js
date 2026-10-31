project("passnet").program(({v0}) => {
const v1 = N.reshape(v0, [1, 1, 1]);
return {out0: v1};
}, {v0: k.tensor([], "f16")});
