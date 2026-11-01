project("passnet").program(({v0, v1, v2, v3, v4}) => {
const v5 = N.expect(N.conv2d(v0, v1, v2, {"stride": [1, 1], "padding": [0, 0], "dilation": [1, 1], "groups": 1}), [128, 16, 1, 1], "f32");
const v6 = N.expect(N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v5, "f32"), [128, 16]), N.reshape(N.cast(v3, "f32"), [16]), N.reshape(N.cast(v4, "f32"), [16]), {"eps": 1e-05}), [128, 16, 1, 1]), "f32"), [128, 16, 1, 1], "f32");
const v7 = N.expect(N.relu(v6), [128, 16, 1, 1], "f32");
return {out0: v7};
}, {v0: k.tensor([128, 80, 1, 1], "f32"), v1: k.tensor([16, 80, 1, 1], "f32"), v2: k.tensor([16], "f32"), v3: k.tensor([16, 1, 1], "f32"), v4: k.tensor([16, 1, 1], "f32")});
