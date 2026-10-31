project("passnet").program(({v0, v1, v2, v3, v4, v5}) => {
const v6 = N.cast(N.add(N.mul(N.div(N.sub(N.cast(v4, "f32"), N.reshape(N.cast(v0, "f32"), [1, 32, 1, 1])), N.sqrt(N.add(N.reshape(N.cast(v1, "f32"), [1, 32, 1, 1]), 1e-05))), N.reshape(N.cast(v3, "f32"), [1, 32, 1, 1])), N.reshape(N.cast(v2, "f32"), [1, 32, 1, 1])), "f32");
const v7 = N.add(v5, v6);
const v8 = N.relu(v7);
const v9 = N.cast(N.mul(N.sum(N.sum(N.cast(v8, "f32"), 2, true), 3, true), 0.0009765625), "f32");
return {out0: v8, out1: v9};
}, {v0: k.tensor([32], "f32"), v1: k.tensor([32], "f32"), v2: k.tensor([32], "f32"), v3: k.tensor([32], "f32"), v4: k.tensor([1, 32, 32, 32], "f32"), v5: k.tensor([1, 32, 32, 32], "f32")});
