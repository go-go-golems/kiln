project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.expect(N.cast(N.linear(N.cast(v0, "f32"), N.cast(v1, "f32"), N.cast(v2, "f32")), "f32"), [128, 49, 1536], "f32");
const v5 = N.expect(N.reshape(v4, [128, 49, 8, 192]), [128, 49, 8, 192], "f32");
const v6_0 = N.expect(N.slice(v5, 3, 0, 32), [128, 49, 8, 32], "f32");
const v6_1 = N.expect(N.slice(v5, 3, 32, 64), [128, 49, 8, 32], "f32");
const v6_2 = N.expect(N.slice(v5, 3, 64, 192), [128, 49, 8, 128], "f32");
const v7 = N.expect(v6_0, [128, 49, 8, 32], "f32");
const v8 = N.expect(v6_1, [128, 49, 8, 32], "f32");
const v9 = N.expect(v6_2, [128, 49, 8, 128], "f32");
const v10 = N.expect(N.transpose(v7, 1, 2), [128, 8, 49, 32], "f32");
const v11 = N.expect(N.transpose(v8, 1, 2), [128, 8, 49, 32], "f32");
const v12 = N.expect(N.transpose(v9, 1, 2), [128, 8, 49, 128], "f32");
const v13 = N.expect(v3, [8, 49, 49], "f32");
const v14 = N.expect(N.transpose(v11, 2, 3), [128, 8, 32, 49], "f32");
return {out0: v10, out1: v13, out2: v14, out3: v12};
}, {v0: k.tensor([128, 49, 448], "f32"), v1: k.tensor([1536, 448], "f32"), v2: k.tensor([1536], "f32"), v3: k.tensor([8, 49, 49], "f32")});
