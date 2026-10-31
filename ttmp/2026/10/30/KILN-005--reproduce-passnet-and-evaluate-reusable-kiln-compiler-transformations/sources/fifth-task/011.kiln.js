project("passnet").program(({v0, v1}) => {
const v2 = N.concat([v0, v1], 1);
const v3 = N.reshape(v2, [32, 672, 16, 16]);
const v4 = N.cast(N.mul(N.sum(N.sum(N.cast(v3, "f32"), 2, true), 3, true), 0.00390625), "bf16");
return {out0: v3, out1: v4};
}, {v0: k.tensor([32, 336, 16, 16], "bf16"), v1: k.tensor([32, 336, 16, 16], "bf16")});
