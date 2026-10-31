project("passnet").program(({v0, v1, v2, v3, v4, v5, v6, v7, v8, v9}) => {
const v10 = N.conv2d(v0, v1, null, {"stride": [2, 2], "padding": [3, 3], "dilation": [1, 1], "groups": 48});
const v11 = N.conv2d(v2, v3, null, {"stride": [2, 2], "padding": [4, 4], "dilation": [1, 1], "groups": 48});
const v12 = N.concat([v4, v5, v10, v11], 1);
const v13 = N.cast(N.add(N.mul(N.div(N.sub(N.cast(v12, "f32"), N.reshape(N.cast(v6, "f32"), [1, 192, 1, 1])), N.sqrt(N.add(N.reshape(N.cast(v7, "f32"), [1, 192, 1, 1]), 1e-05))), N.reshape(N.cast(v8, "f32"), [1, 192, 1, 1])), N.reshape(N.cast(v9, "f32"), [1, 192, 1, 1])), "f32");
const v14 = N.cast(N.silu(N.cast(v13, "f32")), "f32");
const v15 = N.cast(N.mul(N.sum(N.sum(N.cast(v14, "f32"), 2, true), 3, true), 0.00043402777777777775), "f32");
return {out0: v14, out1: v15};
}, {v0: k.tensor([32, 48, 96, 96], "f32"), v1: k.tensor([48, 1, 7, 7], "f32"), v2: k.tensor([32, 48, 96, 96], "f32"), v3: k.tensor([48, 1, 9, 9], "f32"), v4: k.tensor([32, 48, 48, 48], "f32"), v5: k.tensor([32, 48, 48, 48], "f32"), v6: k.tensor([192], "f32"), v7: k.tensor([192], "f32"), v8: k.tensor([192], "f32"), v9: k.tensor([192], "f32")});
