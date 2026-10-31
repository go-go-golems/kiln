project("passnet").program(({v0}) => {
const v1 = N.add(0, v0);
const v2 = N.add(v1, 0);
const v3 = N.cast(N.mul(N.sum(N.sum(N.cast(v2, "f32"), 2, true), 3, true), 0.02040816326530612), "bf16");
return {out0: v2, out1: v3};
}, {v0: k.tensor([128, 2048, 7, 7], "bf16")});
