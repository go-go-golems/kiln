project("passnet").program(({v0, v1, v2, v3, v4}) => {
const v5 = N.expect(N.conv2d(v0, v1, v2, {"stride": [1, 1], "padding": [0, 0], "dilation": [1, 1], "groups": 1}), [4, 19, 1, 1], "bf16");
const v6 = N.expect(N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v5, "f32"), [4, 19]), N.reshape(N.cast(v3, "f32"), [19]), N.reshape(N.cast(v4, "f32"), [19]), {"eps": 1e-05}), [4, 19, 1, 1]), "bf16"), [4, 19, 1, 1], "bf16");
const v7 = N.expect(N.relu(v6), [4, 19, 1, 1], "bf16");
return {out0: v7};
}, {v0: k.tensor([4, 304, 1, 1], "bf16"), v1: k.tensor([19, 304, 1, 1], "bf16"), v2: k.tensor([19], "bf16"), v3: k.tensor([19, 1, 1], "bf16"), v4: k.tensor([19, 1, 1], "bf16")});
