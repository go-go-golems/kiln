project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.concat([v0, v1, v2, v3], 1);
const v5 = N.adaptiveAvgPool2d(v4, [1, 1]);
const v6 = v5;
const v7 = N.reshape(v6, [1, 2048]);
return {out0: v7};
}, {v0: k.tensor([1, 320, 5, 5], "bf16"), v1: k.tensor([1, 768, 5, 5], "bf16"), v2: k.tensor([1, 768, 5, 5], "bf16"), v3: k.tensor([1, 192, 5, 5], "bf16")});
