project("passnet").program(({v0, v1, v2}) => {
const v3 = N.add(v0, v1);
const v4 = N.add(v3, v2);
const v5 = N.cast(N.mul(N.sum(N.sum(N.cast(v4, "f32"), 2, true), 3, true), 0.00031887755102040814), "f32");
return {out0: v4, out1: v5};
}, {v0: k.tensor([1, 160, 56, 56], "f32"), v1: k.tensor([1, 160, 56, 56], "f32"), v2: k.tensor([1, 160, 56, 56], "f32")});
