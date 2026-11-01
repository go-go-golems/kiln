project("passnet").program(({v0, v1, v2, v3, v4}) => {
const v5 = N.expect(N.conv2d(v0, v1, v2, {"stride": [1, 1], "padding": [0, 0], "dilation": [1, 1], "groups": 1}), [16, 1, 20, 20], "bf16");
const v6 = N.expect(N.reshape(v5, [16, 1, 400]), [16, 1, 400], "bf16");
const v7 = N.expect(N.concat([v3, v4, v6], 2), [16, 1, 8400], "bf16");
const v8 = N.expect(N.cast(N.sigmoid(N.cast(v7, "f32")), "bf16"), [16, 1, 8400], "bf16");
const v9 = N.expect(N.sub(v8, 0.25), [16, 1, 8400], "bf16");
const v10 = N.expect(N.mul(v9, 3.141592653589793), [16, 1, 8400], "bf16");
return {out0: v10};
}, {v0: k.tensor([16, 64, 20, 20], "bf16"), v1: k.tensor([1, 64, 1, 1], "bf16"), v2: k.tensor([1], "bf16"), v3: k.tensor([16, 1, 6400], "bf16"), v4: k.tensor([16, 1, 1600], "bf16")});
