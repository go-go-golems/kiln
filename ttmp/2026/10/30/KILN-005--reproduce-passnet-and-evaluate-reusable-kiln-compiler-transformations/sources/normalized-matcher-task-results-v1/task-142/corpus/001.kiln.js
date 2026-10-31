project("passnet").program(({v0, v1, v2, v3, v4}) => {
const v5 = N.conv2d(v0, v1, v2, {"stride": [4, 4], "padding": [0, 0], "dilation": [1, 1], "groups": 1});
const v6 = N.reshape(v5, [1, 96, 65536]);
const v7 = N.transpose(v6, 1, 2);
const v8 = N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v7, "f32"), [65536, 96]), N.reshape(N.cast(v3, "f32"), [96]), N.reshape(N.cast(v4, "f32"), [96]), {"eps": 1e-05}), [1, 65536, 96]), "bf16");
const v9 = v8;
const v10 = N.reshape(v9, [1, 256, 256, 96]);
const v11 = N.pad(v10, [0, 0, 0, 0, 0, 0], "constant", 0);
const v12 = N.reshape(v11, [1, 32, 8, 32, 8, 96]);
const v13 = N.transpose(v12, 2, 3);
return {out0: v9, out1: v13};
}, {v0: k.tensor([1, 3, 1024, 1024], "bf16"), v1: k.tensor([96, 3, 4, 4], "bf16"), v2: k.tensor([96], "bf16"), v3: k.tensor([96], "bf16"), v4: k.tensor([96], "bf16")});
