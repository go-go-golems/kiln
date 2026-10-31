project("passnet").program(({v0}) => {
const v1 = N.cast(N.reshape(N.mul(N.sum(N.sum(N.cast(v0, "f32"), 0, true), 2, true), 0.125), [3]), "f32");
return {out0: v1};
}, {v0: k.tensor([2, 3, 4], "f32")});
