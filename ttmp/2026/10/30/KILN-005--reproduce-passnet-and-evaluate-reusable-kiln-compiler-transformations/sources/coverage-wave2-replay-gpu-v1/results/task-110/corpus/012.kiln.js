project("passnet").program(({v0, v1, v2, v3, v4, v5, v6}) => {
const v7 = N.expect(N.conv2d(v0, v1, v2, {"stride": [1, 1], "padding": [3, 3], "dilation": [1, 1], "groups": 81}), [1, 81, 7, 7], "f16");
const v8 = N.expect(N.concat([v3, v4, v7], 1), [1, 216, 7, 7], "f16");
const v9 = N.expect(N.reshape(v8, [1, 8, 27, 49]), [1, 8, 27, 49], "f16");
const v10 = N.expect(N.transpose(v9, 3, 2), [1, 8, 49, 27], "f16");
const v11 = N.expect(N.mul(v5, v10), [1, 8, 49, 27], "f16");
const v12 = N.expect(N.pad(v11, [0, 0, 1, 0, 0, 0], "constant", 0), [1, 8, 50, 27], "f16");
const v13 = N.expect(N.mul(0.19245008972987526, v6), [1, 8, 50, 27], "f16");
const v14 = N.expect(N.add(v13, v12), [1, 8, 50, 27], "f16");
const v15 = N.expect(N.transpose(v14, 1, 2), [1, 50, 8, 27], "f16");
const v16 = N.expect(N.reshape(v15, [1, 50, 216]), [1, 50, 216], "f16");
return {out0: v16};
}, {v0: k.tensor([1, 81, 7, 7], "f16"), v1: k.tensor([81, 1, 7, 7], "f16"), v2: k.tensor([81], "f16"), v3: k.tensor([1, 54, 7, 7], "f16"), v4: k.tensor([1, 81, 7, 7], "f16"), v5: k.tensor([1, 8, 49, 27], "f16"), v6: k.tensor([1, 8, 50, 27], "f16")});
