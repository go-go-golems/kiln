project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.relu(v0);
const v5 = N.mul(v1, v4);
const v6 = N.add(v5, v2);
const v7 = N.maxPool2d(v3, {"kernel_size": [2, 2], "stride": [1, 1], "padding": [0, 0], "dilation": [1, 1], "ceil_mode": true, "return_indices": false});
const v8 = N.concat([v7, v6], 1);
return {out0: v8};
}, {v0: k.tensor([32, 16, 192, 192], "bf16"), v1: k.tensor([1], "bf16"), v2: k.tensor([1], "bf16"), v3: k.tensor([32, 16, 193, 193], "bf16")});
