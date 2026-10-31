project("passnet").program(({v0, v1}) => {
const v2 = N.adaptiveAvgPool2d(v0, [32, 24]);
const v3 = N.concat([v2, v1], 1);
return {out0: v3};
}, {v0: k.tensor([512, 20, 64, 48], "bf16"), v1: k.tensor([512, 40, 32, 24], "bf16")});
