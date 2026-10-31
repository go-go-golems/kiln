project("passnet").program(({v0, v1, v2}) => {
const v3 = N.add(v1, v2);
const v4 = N.add(v3, v0);
const v5 = N.cast(N.mul(N.sum(N.sum(N.cast(v4, "f32"), 2, true), 3, true), 0.00010850694444444444), "f16");
return {out0: v4, out1: v5};
}, {v0: k.tensor([128, 160, 96, 96], "f16"), v1: k.tensor([128, 160, 96, 96], "f16"), v2: k.tensor([128, 160, 96, 96], "f16")});
