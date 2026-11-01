project("passnet").program(({v0}) => {
const v1 = N.expect(N.relu(v0), [24, 256, 20, 20], "f16");
const v2 = N.expect(N.maxPool2d(v1, {"kernel_size": [5, 5], "stride": [1, 1], "padding": [2, 2], "dilation": [1, 1], "ceil_mode": false, "return_indices": false}), [24, 256, 20, 20], "f16");
const v3 = N.expect(N.maxPool2d(v1, {"kernel_size": [5, 5], "stride": [1, 1], "padding": [2, 2], "dilation": [1, 1], "ceil_mode": false, "return_indices": false}), [24, 256, 20, 20], "f16");
const v4 = N.expect(N.maxPool2d(v1, {"kernel_size": [5, 5], "stride": [1, 1], "padding": [2, 2], "dilation": [1, 1], "ceil_mode": false, "return_indices": false}), [24, 256, 20, 20], "f16");
const v5 = N.expect(N.concat([v1, v2, v3, v4], 1), [24, 1024, 20, 20], "f16");
return {out0: v5, __mut0: v1};
}, {v0: k.tensor([24, 256, 20, 20], "f16")});
