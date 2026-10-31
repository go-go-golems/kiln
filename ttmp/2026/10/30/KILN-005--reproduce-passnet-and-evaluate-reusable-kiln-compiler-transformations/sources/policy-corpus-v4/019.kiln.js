project("passnet").program(({v0, v1}) => {
const v2 = N.add(v0, v1);
const v3 = N.reshape(N.slice(v2, 1, 0, 1), [1, 1, 128]);
const v4 = N.reshape(N.slice(v2, 1, 1, 3137), [1, 3136, 128]);
const v5 = N.transpose(v4, 1, 2);
const v6 = N.reshape(v5, [1, 128, 56, 56]);
return {out0: v3, out1: v6};
}, {v0: k.tensor([1, 3137, 128], "f32"), v1: k.tensor([1, 3137, 128], "f32")});
