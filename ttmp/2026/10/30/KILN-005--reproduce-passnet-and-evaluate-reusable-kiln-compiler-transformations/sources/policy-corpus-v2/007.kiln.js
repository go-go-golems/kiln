project("passnet").program(({v0, v1, v2, v3, v4, v5}) => {
const v6 = N.add(v5, v4);
const v7 = N.cast(N.reshape(N.mul(N.sum(N.sum(N.cast(v6, "f32"), 2, true), 3, true), 0.015625), [1, 384]), "f32");
const v8 = v7;
const v9 = v8;
const v10 = N.cast(N.add(N.mul(N.div(N.sub(N.cast(v9, "f32"), N.reshape(N.cast(v0, "f32"), [1, 384])), N.sqrt(N.add(N.reshape(N.cast(v1, "f32"), [1, 384]), 1e-05))), N.reshape(N.cast(v3, "f32"), [1, 384])), N.reshape(N.cast(v2, "f32"), [1, 384])), "f32");
return {out0: v10, out1: v9};
}, {v0: k.tensor([384], "f32"), v1: k.tensor([384], "f32"), v2: k.tensor([384], "f32"), v3: k.tensor([384], "f32"), v4: k.tensor([1, 384, 8, 8], "f32"), v5: k.tensor([1, 384, 8, 8], "f32")});
