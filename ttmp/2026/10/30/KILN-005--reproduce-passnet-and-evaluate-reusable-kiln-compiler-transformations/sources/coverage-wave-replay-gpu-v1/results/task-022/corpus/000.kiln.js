project("passnet").program(({v0, v1, v2, v3, v4, v5, v6}) => {
const v7 = N.expect(N.add(N.cast(N.transpose(N.transpose(N.transpose(N.reshape(N.linear(N.reshape(N.transpose(N.transpose(N.transpose(N.transpose(N.reshape(N.cast(v0, "f32"), [1, 3, 5, 2, 14, 16, 14, 16]), 1, 2), 2, 4), 3, 6), 5, 6), [980, 1536]), N.reshape(N.cast(v1, "f32"), [768, 1536]), null), [1, 5, 14, 14, 768]), 1, 4), 2, 4), 3, 4), "bf16"), N.reshape(v2, [1, 768, 1, 1, 1])), [1, 768, 5, 14, 14], "bf16");
const v8 = N.expect(N.reshape(v7, [1, 768, 980]), [1, 768, 980], "bf16");
const v9 = N.expect(N.transpose(v8, 1, 2), [1, 980, 768], "bf16");
const v10 = N.expect(N.repeat(v3, [1, 1, 1]), [1, 1, 768], "bf16");
const v11 = N.expect(N.concat([v10, v9], 1), [1, 981, 768], "bf16");
const v12 = N.expect(N.add(v11, v4), [1, 981, 768], "bf16");
const v13 = N.expect(v12, [1, 981, 768], "bf16");
const v14 = N.expect(N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v13, "f32"), [981, 768]), N.reshape(N.cast(v5, "f32"), [768]), N.reshape(N.cast(v6, "f32"), [768]), {"eps": 1e-06}), [1, 981, 768]), "bf16"), [1, 981, 768], "bf16");
return {out0: v13, out1: v14};
}, {v0: k.tensor([1, 3, 10, 224, 224], "bf16"), v1: k.tensor([768, 3, 2, 16, 16], "bf16"), v2: k.tensor([768], "bf16"), v3: k.tensor([1, 1, 768], "bf16"), v4: k.tensor([1, 981, 768], "bf16"), v5: k.tensor([768], "bf16"), v6: k.tensor([768], "bf16")});
