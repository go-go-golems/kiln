project("passnet").program(({v0, v1, v2}) => {
const v3 = N.add(v0, v1);
const v4 = N.reshape(N.slice(v2, 1, 196, 211), [32, 15, 8, 8]);
const v5 = N.concat([v3, v4], 1);
return {out0: v5};
}, {v0: k.tensor([32, 196, 8, 8], "f32"), v1: k.tensor([32, 196, 8, 8], "f32"), v2: k.tensor([32, 211, 8, 8], "f32")});
