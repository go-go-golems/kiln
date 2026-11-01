project("passnet").program(({v0}) => {
const v1 = N.expect(N.div(v0, 11.313708498984761), [1, 17, 17], "f32");
const v2 = N.expect(N.relu(v1), [1, 17, 17], "f32");
const v3 = N.expect(N.cast(N.square(N.cast(v2, "f32")), "f32"), [1, 17, 17], "f32");
return {out0: v3};
}, {v0: k.tensor([1, 17, 17], "f32")});
