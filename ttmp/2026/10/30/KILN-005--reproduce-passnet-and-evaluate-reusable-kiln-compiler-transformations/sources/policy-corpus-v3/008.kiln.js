project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.add(v1, v0);
const v5 = N.relu(v4);
const v6 = N.add(v5, v2);
const v7 = N.add(v6, v3);
return {out0: v7};
}, {v0: k.tensor([8, 256, 16, 12], "f32"), v1: k.tensor([8, 256, 16, 12], "f32"), v2: k.tensor([8, 256, 16, 12], "f32"), v3: k.tensor([8, 256, 16, 12], "f32")});
