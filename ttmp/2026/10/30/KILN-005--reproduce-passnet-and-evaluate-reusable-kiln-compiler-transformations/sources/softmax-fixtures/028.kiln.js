project("passnet").program(({v0}) => {
const v1 = N.cast(N.softmax(N.cast(v0, "f32"), 0), "bf16");
return {out0: v1};
}, {v0: k.tensor([17], "bf16")});
