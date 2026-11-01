project("passnet").program(({v0, v1}) => {
const v2 = N.expect(N.cast(N.silu(N.cast(v0, "f32")), "f16"), [1, 17, 1152], "f16");
const v3_0 = N.expect(N.slice(v2, 2, 0, 512), [1, 17, 512], "f16");
const v3_1 = N.expect(N.slice(v2, 2, 512, 1024), [1, 17, 512], "f16");
const v3_2 = N.expect(N.slice(v2, 2, 1024, 1152), [1, 17, 128], "f16");
const v4 = N.expect(v3_0, [1, 17, 512], "f16");
const v5 = N.expect(v3_1, [1, 17, 512], "f16");
const v6 = N.expect(v3_2, [1, 17, 128], "f16");
const v7 = N.expect(N.reshape(v6, [1, 17, 1, 128]), [1, 17, 1, 128], "f16");
const v8 = N.expect(N.reshape(v1, [1, 1, 2, 128]), [1, 1, 2, 128], "f16");
return {out0: v8, out1: v4, out2: v7, out3: v5, __mut0: v2};
}, {v0: k.tensor([1, 17, 1152], "f16"), v1: k.tensor([2, 128], "f16")});
