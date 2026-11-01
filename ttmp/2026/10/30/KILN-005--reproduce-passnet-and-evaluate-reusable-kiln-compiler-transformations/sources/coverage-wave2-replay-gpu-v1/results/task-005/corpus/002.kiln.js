project("passnet").program(({v0, v1, v2, v3, v4, v5}) => {
const v6 = N.expect(N.cast(N.linear(N.cast(v0, "f32"), N.cast(v1, "f32"), N.cast(v2, "f32")), "f32"), [4, 512, 256], "f32");
const v7 = N.expect(N.reshape(v6, [4, 512, 4, 64]), [4, 512, 4, 64], "f32");
const v8 = N.expect(N.transpose(v7, 1, 2), [4, 4, 512, 64], "f32");
const v9 = N.expect(N.cast(N.matmul(N.safeSoftmax(N.add(N.mul(N.matmul(N.cast(v3, "f32"), N.transpose(N.cast(v4, "f32"), -2, -1), "highest"), 0.125), N.cast(v5, "f32")), -1), N.cast(v8, "f32"), "highest"), "f32"), [4, 4, 512, 64], "f32");
const v10 = N.expect(N.transpose(v9, 1, 2), [4, 512, 4, 64], "f32");
const v11 = N.expect(N.reshape(v10, [4, 512, 256]), [4, 512, 256], "f32");
return {out0: v11};
}, {v0: k.tensor([4, 512, 256], "f32"), v1: k.tensor([256, 256], "f32"), v2: k.tensor([256], "f32"), v3: k.tensor([4, 4, 512, 64], "f32"), v4: k.tensor([4, 4, 512, 64], "f32"), v5: k.tensor([4, 1, 512, 512], "f32")});
