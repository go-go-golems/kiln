project("passnet").program(({v0}) => {
const v1 = N.expect(N.div(v0, 11.313708498984761), [512, 17, 17], "f16");
const v2 = N.expect(N.relu(v1), [512, 17, 17], "f16");
const v3 = N.expect(N.cast(N.square(N.cast(v2, "f32")), "f16"), [512, 17, 17], "f16");
return {out0: v3};
}, {v0: k.tensor([512, 17, 17], "f16")});
