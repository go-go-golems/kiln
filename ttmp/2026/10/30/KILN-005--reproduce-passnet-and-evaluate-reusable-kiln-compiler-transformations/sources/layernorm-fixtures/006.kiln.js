project("passnet").program(({v0, v1, v2}) => {
const v3 = N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v0, "f32"), [2, 15]), N.reshape(N.cast(v1, "f32"), [15]), N.reshape(N.cast(v2, "f32"), [15]), {"eps": 1e-05}), [2, 3, 5]), "f32");
return {out0: v3};
}, {v0: k.tensor([2, 3, 5], "f32"), v1: k.tensor([3, 5], "f32"), v2: k.tensor([3, 5], "f32")});
