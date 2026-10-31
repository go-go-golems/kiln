project("passnet").program(({v0}) => {
const v1 = N.mul(v0, 0.1767766952966369);
const v2 = N.cast(N.softmax(N.cast(v1, "f32"), 3), "bf16");
const v3 = N.transpose(v2, 2, 3);
return {out0: v3};
}, {v0: k.tensor([24, 4, 400, 400], "bf16")});
