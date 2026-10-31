project("passnet").program(({v0, v1}) => {
const v2 = N.add(0, v1);
const v3 = N.add(v2, v0);
const v4 = N.cast(N.mul(N.sum(N.sum(N.cast(v3, "f32"), 2, true), 3, true), 0.00510204081632653), "bf16");
return {out0: v3, out1: v4};
}, {v0: k.tensor([1, 896, 14, 14], "bf16"), v1: k.tensor([1, 896, 14, 14], "bf16")});
