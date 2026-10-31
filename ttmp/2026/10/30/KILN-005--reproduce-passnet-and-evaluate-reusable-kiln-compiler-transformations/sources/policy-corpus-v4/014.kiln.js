project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.concat([v0, v1, v2, v3], -1);
const v5 = N.reshape(v4, [1, 196, 768]);
return {out0: v5};
}, {v0: k.tensor([1, 14, 14, 192], "f32"), v1: k.tensor([1, 14, 14, 192], "f32"), v2: k.tensor([1, 14, 14, 192], "f32"), v3: k.tensor([1, 14, 14, 192], "f32")});
