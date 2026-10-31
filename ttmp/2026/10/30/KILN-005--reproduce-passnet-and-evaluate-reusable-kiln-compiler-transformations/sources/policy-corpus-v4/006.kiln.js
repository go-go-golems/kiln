project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.mul(v0, v3);
const v5 = N.add(v4, v2);
const v6 = N.reshape(N.slice(v1, 0, 0, 729), [729, 12]);
const v7 = N.reshape(v6, [1, 27, 27, 12]);
const v8 = N.transpose(N.transpose(v7, 1, 3), 2, 3);
return {out0: v5, out1: v8};
}, {v0: k.tensor([768], "f32"), v1: k.tensor([732, 12], "f32"), v2: k.tensor([1, 197, 768], "f32"), v3: k.tensor([1, 197, 768], "f32")});
