project("passnet").program(({v0}) => {
const v1 = N.reshape(v0, [1, 1]);
const v2 = N.reshape(v0, [1, 1]);
const v3 = N.reshape(v0, []);
const v4 = N.reshape(v0, []);
const v5 = N.reshape(v0, []);
const v6 = N.reshape(v0, [1, 1]);
return {out0: v1, out1: v2, out2: v3, out3: v4, out4: v5, out5: v6};
}, {v0: k.tensor([1], "f32")});
