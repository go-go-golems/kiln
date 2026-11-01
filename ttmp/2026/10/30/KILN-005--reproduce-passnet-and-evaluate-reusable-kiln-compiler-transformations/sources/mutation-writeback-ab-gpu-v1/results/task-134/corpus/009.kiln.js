project("passnet").program(({v0}) => {
const v1 = N.expect(N.relu(v0), [1, 768, 6, 6], "f32");
const v2 = N.expect(N.cast(N.mul(N.sum(N.sum(N.cast(v1, "f32"), 2, true), 3, true), 0.027777777777777776), "f32"), [1, 768, 1, 1], "f32");
return {out0: v2, __mut0: v1};
}, {v0: k.tensor([1, 768, 6, 6], "f32")});
