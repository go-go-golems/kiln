project("passnet").program(({v0, v1}) => {
const v2 = N.expect(N.cast(N.silu(N.cast(v0, "f32")), "f32"), [64, 17, 1152], "f32");
const v3_0 = N.expect(N.slice(v2, 2, 0, 512), [64, 17, 512], "f32");
const v3_1 = N.expect(N.slice(v2, 2, 512, 1024), [64, 17, 512], "f32");
const v3_2 = N.expect(N.slice(v2, 2, 1024, 1152), [64, 17, 128], "f32");
const v4 = N.expect(v3_0, [64, 17, 512], "f32");
const v5 = N.expect(v3_1, [64, 17, 512], "f32");
const v6 = N.expect(v3_2, [64, 17, 128], "f32");
const v7 = N.expect(N.reshape(v6, [64, 17, 1, 128]), [64, 17, 1, 128], "f32");
const v8 = N.expect(N.reshape(v1, [1, 1, 2, 128]), [1, 1, 2, 128], "f32");
return {out0: v8, out1: v4, out2: v7, out3: v5, __mut0: v2};
}, {v0: k.tensor([64, 17, 1152], "f32"), v1: k.tensor([2, 128], "f32")});
