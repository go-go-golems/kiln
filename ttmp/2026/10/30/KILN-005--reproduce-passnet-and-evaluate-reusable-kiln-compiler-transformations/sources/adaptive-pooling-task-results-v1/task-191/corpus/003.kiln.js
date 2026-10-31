project("passnet").program(({v0, v1}) => {
const v2 = N.relu(v0);
const v3 = N.add(v2, v1);
const v4 = N.adaptiveAvgPool2d(v3, [1, 1]);
return {out0: v4};
}, {v0: k.tensor([128, 2048, 12, 12], "f32"), v1: k.tensor([128, 2048, 12, 12], "f32")});
