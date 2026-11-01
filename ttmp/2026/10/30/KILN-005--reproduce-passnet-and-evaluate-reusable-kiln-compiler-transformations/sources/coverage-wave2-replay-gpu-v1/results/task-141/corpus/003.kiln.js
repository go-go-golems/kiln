project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.expect(N.cast(N.linear(N.cast(v0, "f32"), N.cast(v1, "f32"), N.cast(v2, "f32")), "bf16"), [128, 768, 196], "bf16");
const v5 = N.expect(N.transpose(v4, 2, 1), [128, 196, 768], "bf16");
const v6 = N.expect(N.mul(v3, v5), [128, 196, 768], "bf16");
return {out0: v6};
}, {v0: k.tensor([128, 768, 196], "bf16"), v1: k.tensor([196, 196], "bf16"), v2: k.tensor([196], "bf16"), v3: k.tensor([128, 196, 768], "bf16")});
