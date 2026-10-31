project("passnet").program(({v0}) => {
const v1 = N.cast(N.gelu(N.cast(v0, "f32"), "none"), "bf16");
const v2 = N.reshape(v1, [1, 124, 2, 768]);
const v3 = N.reshape(v2, [1, 248, 768]);
const v4 = N.pad(v3, [0, 0, 0, 1], "constant", 0);
return {out0: v4};
}, {v0: k.tensor([1, 124, 1536], "bf16")});
