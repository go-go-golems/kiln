project("passnet").program(({v0, v1}) => {
const v2_0 = N.expect(N.cast(N.amax(v0, -1, true), "f16"), [8, 512, 1], "f16");
const v2_1 = N.expect(N.argmax(v0, -1, true), [8, 512, 1], "i64");
const v3 = N.expect(v2_0, [8, 512, 1], "f16");
const v4 = N.expect(N.expand(v3, [8, 512, 512]), [8, 512, 512], "f16");
const v5 = N.expect(N.sub(v4, v0), [8, 512, 512], "f16");
const v6 = N.expect(N.cast(N.softmax(N.cast(v5, "f32"), 2), "f16"), [8, 512, 512], "f16");
const v7 = N.expect(N.reshape(v1, [8, 512, 4096]), [8, 512, 4096], "f16");
return {out0: v6, out1: v7};
}, {v0: k.tensor([8, 512, 512], "f16"), v1: k.tensor([8, 512, 64, 64], "f16")});
