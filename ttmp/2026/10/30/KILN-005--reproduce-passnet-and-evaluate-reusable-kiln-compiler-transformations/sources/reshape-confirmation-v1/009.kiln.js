project("passnet").program(({v0}) => {
const v1 = N.cast(N.softmax(N.cast(v0, "f32"), 0), "f32");
const v2 = N.reshape(v1, [13, 1, 1]);
return {out0: v2};
}, {v0: k.tensor([13], "f32")});
