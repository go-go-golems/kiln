project("passnet").program(({v0, v1}) => {
const v2 = N.add(v0, v1);
const v3 = N.reshape(v2, [8, 625, 625]);
const v4 = N.cast(N.softmax(N.cast(v3, "f32"), 2), "f32");
const v5 = N.reshape(v4, [1, 8, 625, 625]);
const v6 = N.reshape(v5, [8, 625, 625]);
const v7 = v6;
return {out0: v7, out1: v5};
}, {v0: k.tensor([1, 8, 625, 625], "f32"), v1: k.tensor([1, 1, 625, 625], "f32")});
