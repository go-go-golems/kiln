project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.cast(N.linear(N.cast(v0, "f32"), N.cast(v1, "f32"), N.cast(v2, "f32")), "f16");
const v5 = N.transpose(v4, -1, -2);
const v6 = N.mul(v3, v5);
return {out0: v6};
}, {v0: k.tensor([1, 768, 196], "f16"), v1: k.tensor([196, 196], "f16"), v2: k.tensor([196], "f16"), v3: k.tensor([1, 196, 768], "f16")});
