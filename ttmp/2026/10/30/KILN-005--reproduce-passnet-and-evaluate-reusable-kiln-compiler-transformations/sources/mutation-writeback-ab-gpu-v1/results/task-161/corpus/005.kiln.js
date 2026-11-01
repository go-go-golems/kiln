project("passnet").program(({v0}) => {
const v1 = N.expect(N.relu(v0), [32, 1280, 1, 1], "bf16");
const v2 = N.expect(N.reshape(v1, [32, 1280]), [32, 1280], "bf16");
return {out0: v2, __mut0: v1};
}, {v0: k.tensor([32, 1280, 1, 1], "bf16")});
