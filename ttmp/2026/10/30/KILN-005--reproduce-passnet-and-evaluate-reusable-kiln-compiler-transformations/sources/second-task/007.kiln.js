project("passnet").program(({v0}) => {
const v1 = N.div(v0, 2.8284271247461903);
const v2 = N.transpose(v1, -1, -2);
return {out0: v2};
}, {v0: k.tensor([1, 12, 16, 64], "f16")});
