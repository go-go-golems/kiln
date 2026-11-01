project("passnet").program(({v0}) => {
const v1 = N.expect(N.cast(N.reshape(N.sum(N.cast(v0, "f32"), 3, true), [1, 16, 196]), "bf16"), [1, 16, 196], "bf16");
const v2 = N.expect(N.reshape(v1, [1, 16, 196, 1]), [1, 16, 196, 1], "bf16");
const v3 = N.expect(N.div(v0, v2), [1, 16, 196, 196], "bf16");
const v4 = N.expect(v3, [1, 16, 196, 196], "bf16");
return {out0: v4, __mut0: v3};
}, {v0: k.tensor([1, 16, 196, 196], "bf16")});
