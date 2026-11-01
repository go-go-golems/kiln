project("passnet").program(({v0, v1, v2, v3, v4}) => {
const v5 = N.expect(N.conv2d(v0, v1, v2, {"stride": [1, 1], "padding": [1, 1], "dilation": [1, 1], "groups": 768}), [1, 768, 16, 16], "bf16");
const v6 = N.expect(N.add(v5, v0), [1, 768, 16, 16], "bf16");
const v7 = N.expect(N.reshape(v6, [1, 768, 256]), [1, 768, 256], "bf16");
const v8 = N.expect(N.transpose(v7, 1, 2), [1, 256, 768], "bf16");
const v9 = N.expect(N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v8, "f32"), [256, 768]), N.reshape(N.cast(v3, "f32"), [768]), N.reshape(N.cast(v4, "f32"), [768]), {"eps": 1e-05}), [1, 256, 768]), "bf16"), [1, 256, 768], "bf16");
const v10 = N.expect(N.transpose(v9, 0, 1), [256, 1, 768], "bf16");
const v11 = N.expect(N.transpose(v9, 0, 1), [256, 1, 768], "bf16");
return {out0: v8, out1: v11, out2: v10};
}, {v0: k.tensor([1, 768, 16, 16], "bf16"), v1: k.tensor([768, 1, 3, 3], "bf16"), v2: k.tensor([768], "bf16"), v3: k.tensor([768], "bf16"), v4: k.tensor([768], "bf16")});
