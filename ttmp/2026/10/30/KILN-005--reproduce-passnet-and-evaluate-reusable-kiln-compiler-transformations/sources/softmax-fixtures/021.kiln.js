project("passnet").program(({v0}) => {
const v1 = N.cast(N.softmax(N.cast(v0, "f32"), 2), "f16");
const v2 = N.relu(v1);
return {out0: v2};
}, {v0: k.tensor([2, 3, 7], "f16")});
