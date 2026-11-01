project("passnet").program(({v0}) => {
const v1 = N.expect(N.relu(v0), [1, 1280, 1, 1], "f16");
const v2 = N.expect(N.reshape(v1, [1, 1280]), [1, 1280], "f16");
return {out0: v2, __mut0: v1};
}, {v0: k.tensor([1, 1280, 1, 1], "f16")});
