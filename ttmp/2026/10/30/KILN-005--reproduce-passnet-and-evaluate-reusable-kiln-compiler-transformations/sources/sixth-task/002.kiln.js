project("passnet").program(({v0, v1}) => {
const v2 = N.cast(N.silu(N.cast(v0, "f32")), "f16");
const v3 = N.mul(v2, v1);
const v4 = v3;
return {out0: v4};
}, {v0: k.tensor([1, 257, 1024], "f16"), v1: k.tensor([1, 257, 1024], "f16")});
