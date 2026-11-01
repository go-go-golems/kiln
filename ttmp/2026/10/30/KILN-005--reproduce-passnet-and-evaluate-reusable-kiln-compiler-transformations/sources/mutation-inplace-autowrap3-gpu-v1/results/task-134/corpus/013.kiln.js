project("passnet").program(({v0}) => {
const v1 = N.expect(N.relu(v0), [1, 384, 12, 12], "f32");
const v2 = N.expect(N.cast(N.mul(N.sum(N.sum(N.cast(v1, "f32"), 2, true), 3, true), 0.006944444444444444), "f32"), [1, 384, 1, 1], "f32");
return {out0: v2, __mut0: v1};
}, {v0: k.tensor([1, 384, 12, 12], "f32")});
