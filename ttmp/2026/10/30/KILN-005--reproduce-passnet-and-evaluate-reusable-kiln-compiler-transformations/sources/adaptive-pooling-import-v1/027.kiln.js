project("passnet").program(({v0, v1}) => {
const v2 = N.relu(v1);
const v3 = N.add(v2, v0);
const v4 = N.adaptiveAvgPool2d(v3, [1, 1]);
return {out0: v4};
}, {v0: k.tensor([32, 2048, 7, 7], "bf16"), v1: k.tensor([32, 2048, 7, 7], "bf16")});
