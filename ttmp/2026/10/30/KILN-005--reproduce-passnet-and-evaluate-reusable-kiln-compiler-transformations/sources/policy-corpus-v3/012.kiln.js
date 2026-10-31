project("passnet").program(({v0, v1, v2, v3, v4, v5}) => {
const v6 = N.reshape(N.slice(v5, 1, 256, 296), [1, 40, 64, 64]);
const v7 = N.cast(N.add(N.mul(N.div(N.sub(N.cast(v4, "f32"), N.reshape(N.cast(v0, "f32"), [1, 128, 1, 1])), N.sqrt(N.add(N.reshape(N.cast(v1, "f32"), [1, 128, 1, 1]), 0.001))), N.reshape(N.cast(v3, "f32"), [1, 128, 1, 1])), N.reshape(N.cast(v2, "f32"), [1, 128, 1, 1])), "f32");
return {out0: v7, out1: v6};
}, {v0: k.tensor([128], "f32"), v1: k.tensor([128], "f32"), v2: k.tensor([128], "f32"), v3: k.tensor([128], "f32"), v4: k.tensor([1, 128, 64, 64], "f32"), v5: k.tensor([1, 296, 64, 64], "f32")});
