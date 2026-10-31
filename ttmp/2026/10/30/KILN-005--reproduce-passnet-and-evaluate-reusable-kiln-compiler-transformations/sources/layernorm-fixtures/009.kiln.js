project("passnet").program(({v0}) => {
const v1 = N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v0, "f32"), [3, 33]), N.const(1, [33]), N.const(0, [33]), {"eps": 1e-05}), [3, 33]), "f32");
return {out0: v1};
}, {v0: k.tensor([3, 33], "f32")});
