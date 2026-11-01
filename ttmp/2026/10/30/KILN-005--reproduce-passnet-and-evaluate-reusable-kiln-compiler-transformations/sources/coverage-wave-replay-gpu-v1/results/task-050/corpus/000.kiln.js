project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.expect(N.add(v0, v1), [1, 128, 16, 12], "f16");
const v5 = N.expect(N.add(v4, v2), [1, 128, 16, 12], "f16");
const v6 = N.expect(N.relu(v5), [1, 128, 16, 12], "f16");
const v7 = N.expect(N.reshape(v3, [1, 32, 3072]), [1, 32, 3072], "f16");
const v8 = N.expect(N.transpose(v7, 1, 2), [1, 3072, 32], "f16");
return {out0: v8, __mut0: v6};
}, {v0: k.tensor([1, 128, 16, 12], "f16"), v1: k.tensor([1, 128, 16, 12], "f16"), v2: k.tensor([1, 128, 16, 12], "f16"), v3: k.tensor([1, 32, 64, 48], "f16")});
