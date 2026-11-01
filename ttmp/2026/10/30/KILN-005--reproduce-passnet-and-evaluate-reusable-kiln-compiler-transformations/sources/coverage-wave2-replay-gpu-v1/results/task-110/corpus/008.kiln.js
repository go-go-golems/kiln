project("passnet").program(({v0, v1, v2, v3, v4, v5, v6}) => {
const v7 = N.expect(N.conv2d(v0, v1, v2, {"stride": [1, 1], "padding": [3, 3], "dilation": [1, 1], "groups": 120}), [1, 120, 24, 24], "f32");
const v8 = N.expect(N.concat([v3, v4, v7], 1), [1, 320, 24, 24], "f32");
const v9 = N.expect(N.reshape(v8, [1, 8, 40, 576]), [1, 8, 40, 576], "f32");
const v10 = N.expect(N.transpose(v9, 3, 2), [1, 8, 576, 40], "f32");
const v11 = N.expect(N.mul(v5, v10), [1, 8, 576, 40], "f32");
const v12 = N.expect(N.pad(v11, [0, 0, 1, 0, 0, 0], "constant", 0), [1, 8, 577, 40], "f32");
const v13 = N.expect(N.mul(0.15811388300841897, v6), [1, 8, 577, 40], "f32");
const v14 = N.expect(N.add(v13, v12), [1, 8, 577, 40], "f32");
const v15 = N.expect(N.transpose(v14, 1, 2), [1, 577, 8, 40], "f32");
const v16 = N.expect(N.reshape(v15, [1, 577, 320]), [1, 577, 320], "f32");
return {out0: v16};
}, {v0: k.tensor([1, 120, 24, 24], "f32"), v1: k.tensor([120, 1, 7, 7], "f32"), v2: k.tensor([120], "f32"), v3: k.tensor([1, 80, 24, 24], "f32"), v4: k.tensor([1, 120, 24, 24], "f32"), v5: k.tensor([1, 8, 576, 40], "f32"), v6: k.tensor([1, 8, 577, 40], "f32")});
