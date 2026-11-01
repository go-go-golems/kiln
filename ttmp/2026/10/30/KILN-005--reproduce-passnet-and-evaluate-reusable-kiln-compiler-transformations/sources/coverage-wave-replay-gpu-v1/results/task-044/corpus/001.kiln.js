project("passnet").program(({v0, v1, v2, v3, v4}) => {
const v5 = N.expect(N.reshape(N.conv2d(N.reshape(v0, [1, 768, 1, 249]), N.reshape(v1, [768, 48, 1, 31]), v2, {"stride": [1, 2], "padding": [0, 15], "dilation": [1, 1], "groups": 16}), [1, 768, 125]), [1, 768, 125], "f16");
const v6 = N.expect(N.cast(N.gelu(N.cast(v5, "f32"), "none"), "f16"), [1, 768, 125], "f16");
const v7 = N.expect(N.reshape(N.avgPool2d(N.reshape(v0, [1, 768, 1, 249]), {"kernel_size": [1, 2], "stride": [1, 2], "padding": [0, 0], "ceil_mode": false, "count_include_pad": true, "divisor_override": null}), [1, 768, 124]), [1, 768, 124], "f16");
const v8 = N.expect(N.reshape(v7, [1, 768, 124]), [1, 768, 124], "f16");
const v9 = N.expect(N.reshape(N.slice(v6, 2, 0, 124), [1, 768, 124]), [1, 768, 124], "f16");
const v10 = N.expect(N.add(v8, v9), [1, 768, 124], "f16");
const v11 = N.expect(N.transpose(v10, 1, 2), [1, 124, 768], "f16");
const v12 = N.expect(N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v11, "f32"), [124, 768]), N.reshape(N.cast(v3, "f32"), [768]), N.reshape(N.cast(v4, "f32"), [768]), {"eps": 1e-05}), [1, 124, 768]), "f16"), [1, 124, 768], "f16");
const v13 = N.expect(v12, [1, 124, 768], "f16");
return {out0: v13};
}, {v0: k.tensor([1, 768, 249], "f16"), v1: k.tensor([768, 48, 31], "f16"), v2: k.tensor([768], "f16"), v3: k.tensor([768], "f16"), v4: k.tensor([768], "f16")});
