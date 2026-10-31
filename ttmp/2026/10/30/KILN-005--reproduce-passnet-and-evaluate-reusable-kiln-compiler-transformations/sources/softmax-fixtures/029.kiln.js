project("passnet").program(({v0}) => {
const v1 = N.cast(N.reshape(N.softmax(N.reshape(N.cast(v0, "f32"), [1]), 0), []), "bf16");
return {out0: v1};
}, {v0: k.tensor([], "bf16")});
