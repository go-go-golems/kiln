project("passnet").program(({v0}) => {
const v1 = N.relu(v0);
const v2 = N.cast(N.mul(N.sum(N.sum(N.cast(v1, "f32"), 2, true), 3, true), 0.015625), "f32");
return {out0: v1, out1: v2};
}, {v0: k.tensor([1, 1280, 8, 8], "f32")});
