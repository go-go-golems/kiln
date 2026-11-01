project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.expect(N.reshape(v0, [1, 8, 8, 8, 8, 384]), [1, 8, 8, 8, 8, 384], "bf16");
const v5 = N.expect(N.reshape(v4, [1, 64, 64, 384]), [1, 64, 64, 384], "bf16");
const v6 = N.expect(N.roll(v5, [4, 4], [1, 2]), [1, 64, 64, 384], "bf16");
const v7 = N.expect(N.reshape(v6, [1, 4096, 384]), [1, 4096, 384], "bf16");
const v8 = N.expect(N.cast(N.reshape(N.layer_norm(N.reshape(N.cast(v7, "f32"), [4096, 384]), N.reshape(N.cast(v1, "f32"), [384]), N.reshape(N.cast(v2, "f32"), [384]), {"eps": 1e-05}), [1, 4096, 384]), "bf16"), [1, 4096, 384], "bf16");
const v9 = N.expect(N.add(v3, v8), [1, 4096, 384], "bf16");
return {out0: v9};
}, {v0: k.tensor([1, 8, 8, 8, 8, 384], "bf16"), v1: k.tensor([384], "bf16"), v2: k.tensor([384], "bf16"), v3: k.tensor([1, 4096, 384], "bf16")});
