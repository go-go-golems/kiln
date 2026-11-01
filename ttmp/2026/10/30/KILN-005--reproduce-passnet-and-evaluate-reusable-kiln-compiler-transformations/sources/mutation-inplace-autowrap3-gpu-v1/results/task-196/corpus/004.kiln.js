project("passnet").program(({v0}) => {
const v1 = N.expect(N.relu(v0), [2, 256, 1, 1], "f16");
const v2 = N.expect(N.cast(N.sigmoid(N.cast(v1, "f32")), "f16"), [2, 256, 1, 1], "f16");
return {out0: v2, __mut0: v1};
}, {v0: k.tensor([2, 256, 1, 1], "f16")});
