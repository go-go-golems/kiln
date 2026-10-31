project("passnet").program(({v0, v1, v2}) => {
const v3 = N.add(v0, v1);
const v4 = N.reshape(N.slice(v2, 1, 75, 92), [1, 17, 28, 28]);
const v5 = N.concat([v3, v4], 1);
return {out0: v5};
}, {v0: k.tensor([1, 75, 28, 28], "f32"), v1: k.tensor([1, 75, 28, 28], "f32"), v2: k.tensor([1, 92, 28, 28], "f32")});
