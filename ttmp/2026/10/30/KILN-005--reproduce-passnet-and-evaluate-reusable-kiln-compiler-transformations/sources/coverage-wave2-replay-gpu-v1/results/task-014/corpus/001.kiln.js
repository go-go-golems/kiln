project("passnet").program(({v0, v1, v2, v3, v4}) => {
const v5 = N.expect(N.conv2d(v0, v1, v2, {"stride": [1, 1], "padding": [1, 1], "dilation": [1, 1], "groups": 1024}), [1, 1024, 16, 16], "f32");
const v6 = N.expect(N.add(v5, v0), [1, 1024, 16, 16], "f32");
const v7 = N.expect(N.reshape(v6, [1, 1024, 256]), [1, 1024, 256], "f32");
const v8 = N.expect(N.transpose(v7, 1, 2), [1, 256, 1024], "f32");
const v9 = N.expect(N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v8, "f32"), [256, 1024]), N.reshape(N.cast(v3, "f32"), [1024]), N.reshape(N.cast(v4, "f32"), [1024]), {"eps": 1e-05}), [1, 256, 1024]), "f32"), [1, 256, 1024], "f32");
const v10 = N.expect(N.transpose(v9, 0, 1), [256, 1, 1024], "f32");
const v11 = N.expect(N.transpose(v9, 0, 1), [256, 1, 1024], "f32");
return {out0: v8, out1: v11, out2: v10};
}, {v0: k.tensor([1, 1024, 16, 16], "f32"), v1: k.tensor([1024, 1, 3, 3], "f32"), v2: k.tensor([1024], "f32"), v3: k.tensor([1024], "f32"), v4: k.tensor([1024], "f32")});
