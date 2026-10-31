project("passnet").program(({v0, v1, v2, v3, v4, v5, v6}) => {
const v7 = N.conv2d(v6, v1, v0, {"stride": [1, 1], "padding": [0, 0], "dilation": [1, 1], "groups": 1});
const v8 = v7;
const v9 = N.reshape(v2, [256, 1]);
const v10 = N.reshape(v9, [256, 1, 1]);
const v11 = N.mul(v10, v8);
const v12 = N.add(v5, v11);
const v13 = N.reshape(v12, [8, 256, 49]);
const v14 = N.transpose(v13, 1, 2);
const v15 = N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v14, "f32"), [392, 256]), N.reshape(N.cast(v4, "f32"), [256]), N.reshape(N.cast(v3, "f32"), [256]), {"eps": 1e-06}), [8, 49, 256]), "f32");
const v16 = N.reshape(v15, [8, 7, 7, 256]);
const v17 = N.transpose(N.transpose(v16, 1, 3), 2, 3);
return {out0: v17};
}, {v0: k.tensor([256], "f32"), v1: k.tensor([256, 1024, 1, 1], "f32"), v2: k.tensor([256], "f32"), v3: k.tensor([256], "f32"), v4: k.tensor([256], "f32"), v5: k.tensor([8, 256, 7, 7], "f32"), v6: k.tensor([8, 1024, 7, 7], "f32")});
