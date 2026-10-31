project("passnet").program(({v0, v1}) => {
const v2 = N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v0, "f32"), [2, 17]), N.const(1, [17]), N.reshape(N.cast(v1, "f32"), [17]), {"eps": 1e-05}), [2, 17]), "f16");
return {out0: v2};
}, {v0: k.tensor([2, 17], "f16"), v1: k.tensor([17], "f16")});
