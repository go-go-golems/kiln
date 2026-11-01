project("passnet").program(({v0}) => {
const v1 = N.expect(N.relu(v0), [1, 192, 24, 24], "f16");
const v2 = N.expect(N.cast(N.mul(N.sum(N.sum(N.cast(v1, "f32"), 2, true), 3, true), 0.001736111111111111), "f16"), [1, 192, 1, 1], "f16");
return {out0: v2, __mut0: v1};
}, {v0: k.tensor([1, 192, 24, 24], "f16")});
