project("passnet").program(({v0, v1, v2, v3, v4}) => {
const v5 = N.expect(N.conv2d(v0, v1, v2, {"stride": [1, 1], "padding": [0, 0], "dilation": [1, 1], "groups": 1}), [1, 1, 20, 20], "f32");
const v6 = N.expect(N.reshape(v5, [1, 1, 400]), [1, 1, 400], "f32");
const v7 = N.expect(N.concat([v3, v4, v6], 2), [1, 1, 8400], "f32");
const v8 = N.expect(N.cast(N.sigmoid(N.cast(v7, "f32")), "f32"), [1, 1, 8400], "f32");
const v9 = N.expect(N.sub(v8, 0.25), [1, 1, 8400], "f32");
const v10 = N.expect(N.mul(v9, 3.141592653589793), [1, 1, 8400], "f32");
return {out0: v10};
}, {v0: k.tensor([1, 64, 20, 20], "f32"), v1: k.tensor([1, 64, 1, 1], "f32"), v2: k.tensor([1], "f32"), v3: k.tensor([1, 1, 6400], "f32"), v4: k.tensor([1, 1, 1600], "f32")});
