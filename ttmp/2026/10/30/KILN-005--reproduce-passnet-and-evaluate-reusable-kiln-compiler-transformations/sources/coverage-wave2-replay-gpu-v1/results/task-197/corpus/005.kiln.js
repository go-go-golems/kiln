project("passnet").program(({v0, v1, v2}) => {
const v3 = N.expect(N.cast(N.sigmoid(N.cast(v0, "f32")), "f16"), [1, 1, 2048], "f16");
const v4 = N.expect(N.reshape(v3, [1, 2048, 1, 1]), [1, 2048, 1, 1], "f16");
const v5 = N.expect(N.expand(v4, [1, 2048, 11, 11]), [1, 2048, 11, 11], "f16");
const v6 = N.expect(N.mul(v1, v5), [1, 2048, 11, 11], "f16");
const v7 = N.expect(N.add(v6, v2), [1, 2048, 11, 11], "f16");
const v8 = N.expect(N.relu(v7), [1, 2048, 11, 11], "f16");
const v9 = N.expect(N.adaptiveAvgPool2d(v8, [1, 1]), [1, 2048, 1, 1], "f16");
const v10 = N.expect(N.reshape(v9, [1, 2048]), [1, 2048], "f16");
return {out0: v10};
}, {v0: k.tensor([1, 1, 2048], "f16"), v1: k.tensor([1, 2048, 11, 11], "f16"), v2: k.tensor([1, 2048, 11, 11], "f16")});
