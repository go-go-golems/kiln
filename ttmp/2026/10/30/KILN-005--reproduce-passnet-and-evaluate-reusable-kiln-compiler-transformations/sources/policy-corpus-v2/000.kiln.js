project("passnet").program(({v0, v1, v2, v3, v4}) => {
const v5 = N.relu(v4);
const v6 = N.cast(N.add(N.mul(N.div(N.sub(N.cast(v5, "f32"), N.reshape(N.cast(v0, "f32"), [1, 128])), N.sqrt(N.add(N.reshape(N.cast(v1, "f32"), [1, 128]), 1e-05))), N.reshape(N.cast(v3, "f32"), [1, 128])), N.reshape(N.cast(v2, "f32"), [1, 128])), "f32");
const v7 = v6;
return {out0: v7};
}, {v0: k.tensor([128], "f32"), v1: k.tensor([128], "f32"), v2: k.tensor([128], "f32"), v3: k.tensor([128], "f32"), v4: k.tensor([1000, 128], "f32")});
