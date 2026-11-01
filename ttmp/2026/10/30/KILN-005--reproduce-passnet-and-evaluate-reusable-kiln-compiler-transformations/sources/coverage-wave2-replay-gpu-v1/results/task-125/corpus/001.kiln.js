project("passnet").program(({v0, v1, v2, v3, v4, v5}) => {
const v6 = N.expect(N.reshape(N.conv2d(N.reshape(v0, [1, 1024, 1, 249]), N.reshape(v1, [1024, 64, 1, 128]), v2, {"stride": [1, 1], "padding": [0, 64], "dilation": [1, 1], "groups": 16}), [1, 1024, 250]), [1, 1024, 250], "f16");
const v7 = N.expect(N.reshape(N.slice(v6, 2, 0, 249), [1, 1024, 249]), [1, 1024, 249], "f16");
const v8 = N.expect(N.cast(N.gelu(N.cast(v7, "f32"), "none"), "f16"), [1, 1024, 249], "f16");
const v9 = N.expect(N.transpose(v8, 1, 2), [1, 249, 1024], "f16");
const v10 = N.expect(N.add(v3, v9), [1, 249, 1024], "f16");
const v11 = N.expect(v10, [1, 249, 1024], "f16");
const v12 = N.expect(N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v11, "f32"), [249, 1024]), N.reshape(N.cast(v4, "f32"), [1024]), N.reshape(N.cast(v5, "f32"), [1024]), {"eps": 1e-05}), [1, 249, 1024]), "f16"), [1, 249, 1024], "f16");
return {out0: v11, out1: v12};
}, {v0: k.tensor([1, 1024, 249], "f16"), v1: k.tensor([1024, 64, 128], "f16"), v2: k.tensor([1024], "f16"), v3: k.tensor([1, 249, 1024], "f16"), v4: k.tensor([1024], "f16"), v5: k.tensor([1024], "f16")});
