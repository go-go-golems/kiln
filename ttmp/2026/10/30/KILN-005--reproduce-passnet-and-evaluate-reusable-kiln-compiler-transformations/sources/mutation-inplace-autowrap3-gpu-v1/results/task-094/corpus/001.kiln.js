project("passnet").program(({v0, v1}) => {
const v2 = N.expect(N.add(v0, v1), [1, 128, 19], "bf16");
const v3 = N.expect(N.transpose(v2, 1, 2), [1, 19, 128], "bf16");
return {out0: v3, __mut0: v2};
}, {v0: k.tensor([1, 128, 19], "bf16"), v1: k.tensor([128, 1], "bf16")});
