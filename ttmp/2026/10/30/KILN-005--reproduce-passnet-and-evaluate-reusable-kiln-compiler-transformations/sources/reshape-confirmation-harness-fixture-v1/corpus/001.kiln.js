project("passnet").program(({v0}) => {
const v1 = N.cast(N.sum(N.cast(v0, "f32"), 1, true), "f32");
return {out0: v1};
}, {v0: k.tensor([3, 7], "f32")});
