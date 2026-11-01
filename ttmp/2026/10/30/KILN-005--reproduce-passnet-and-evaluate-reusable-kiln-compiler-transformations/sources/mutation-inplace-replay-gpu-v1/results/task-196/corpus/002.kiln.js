project("passnet").program(({v0}) => {
const v1 = N.expect(N.relu(v0), [16, 256, 1, 1], "bf16");
const v2 = N.expect(N.cast(N.sigmoid(N.cast(v1, "f32")), "bf16"), [16, 256, 1, 1], "bf16");
return {out0: v2, __mut0: v1};
}, {v0: k.tensor([16, 256, 1, 1], "bf16")});
