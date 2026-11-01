project("passnet").program(({v0, v1, v2, v3, v4}) => {
const v5 = N.expect(N.conv2d(v0, v1, v2, {"stride": [1, 1], "padding": [0, 0], "dilation": [1, 1], "groups": 1}), [24, 128, 1, 1], "bf16");
const v6 = N.expect(N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v5, "f32"), [24, 128]), N.reshape(N.cast(v3, "f32"), [128]), N.reshape(N.cast(v4, "f32"), [128]), {"eps": 1e-05}), [24, 128, 1, 1]), "bf16"), [24, 128, 1, 1], "bf16");
const v7 = N.expect(N.relu(v6), [24, 128, 1, 1], "bf16");
return {out0: v7};
}, {v0: k.tensor([24, 512, 1, 1], "bf16"), v1: k.tensor([128, 512, 1, 1], "bf16"), v2: k.tensor([128], "bf16"), v3: k.tensor([128, 1, 1], "bf16"), v4: k.tensor([128, 1, 1], "bf16")});
