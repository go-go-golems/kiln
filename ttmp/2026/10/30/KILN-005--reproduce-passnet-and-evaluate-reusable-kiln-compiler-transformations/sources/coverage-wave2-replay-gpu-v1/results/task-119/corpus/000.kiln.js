project("passnet").program(({v0, v1, v2, v3, v4}) => {
const v5 = N.expect(N.conv2d(v0, v1, v2, {"stride": [1, 1], "padding": [0, 0], "dilation": [1, 1], "groups": 1}), [16, 21, 64, 64], "f32");
const v6 = N.expect(N.add(v3, v4), [16, 512, 64, 64], "f32");
const v7 = N.expect(v6, [16, 512, 64, 64], "f32");
return {out0: v7, out1: v5};
}, {v0: k.tensor([16, 512, 64, 64], "f32"), v1: k.tensor([21, 512, 1, 1], "f32"), v2: k.tensor([21], "f32"), v3: k.tensor([16, 512, 64, 64], "f32"), v4: k.tensor([16, 512, 64, 64], "f32")});
