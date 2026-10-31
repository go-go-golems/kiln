project("passnet").program(({v0, v1, v2}) => {
const v3 = N.relu(v0);
const v4 = N.mul(v1, v3);
const v5 = N.add(v4, v2);
const v6 = N.pad(v5, [0, 1, 0, 1], "constant", 0);
return {out0: v6};
}, {v0: k.tensor([1, 16, 192, 192], "bf16"), v1: k.tensor([1], "bf16"), v2: k.tensor([1], "bf16")});
