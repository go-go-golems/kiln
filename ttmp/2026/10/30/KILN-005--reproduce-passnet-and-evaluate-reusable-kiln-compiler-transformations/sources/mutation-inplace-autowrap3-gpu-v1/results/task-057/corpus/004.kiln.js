project("passnet").program(({v0, v1, v2, v3, v4}) => {
const v5 = N.expect(N.cast(N.transpose(N.reshape(N.matmul(N.reshape(N.transpose(N.cast(v0, "f32"), 1, 2), [1536, 512, 64]), N.reshape(N.transpose(N.cast(v1, "f32"), 2, 3), [1536, 64, 64])), [24, 64, 512, 64]), 1, 2), "f32"), [24, 512, 64, 64], "f32");
const v6 = N.expect(N.add(v2, v5), [24, 512, 64, 64], "f32");
const v7 = N.expect(N.mul(v6, v3), [24, 512, 64, 64], "f32");
const v8 = N.expect(N.add(v7, v4), [24, 512, 64, 64], "f32");
const v9 = N.expect(N.reshape(v8, [24, 512, 64, 64]), [24, 512, 64, 64], "f32");
return {out0: v9, __mut2: v6};
}, {v0: k.tensor([24, 512, 64, 64], "f32"), v1: k.tensor([24, 64, 64, 64], "f32"), v2: k.tensor([24, 512, 64, 64], "f32"), v3: k.tensor([], "f32"), v4: k.tensor([24, 512, 64, 64], "f32")});
