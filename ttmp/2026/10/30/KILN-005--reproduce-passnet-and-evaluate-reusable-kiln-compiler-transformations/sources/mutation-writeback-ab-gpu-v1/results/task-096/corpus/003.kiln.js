project("passnet").program(({v0, v1}) => {
const v2 = N.expect(N.cast(N.silu(N.cast(v0, "f32")), "bf16"), [8, 128, 32, 32], "bf16");
const v3 = N.expect(N.add(v2, v1), [8, 128, 32, 32], "bf16");
return {out0: v3, __mut0: v2};
}, {v0: k.tensor([8, 128, 32, 32], "bf16"), v1: k.tensor([8, 128, 32, 32], "bf16")});
