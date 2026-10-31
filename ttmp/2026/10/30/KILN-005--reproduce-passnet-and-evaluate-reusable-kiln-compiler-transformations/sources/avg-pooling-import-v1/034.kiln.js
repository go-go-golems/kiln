project("passnet").program(({v0, v1, v2}) => {
const v3 = N.relu(v2);
const v4 = N.avgPool2d(v3, {"kernel_size": [3, 3], "stride": [1, 1], "padding": [1, 1], "ceil_mode": false, "count_include_pad": false, "divisor_override": null});
const v5 = N.sub(v4, v3);
const v6 = N.reshape(v0, [48, 1]);
const v7 = N.reshape(v6, [48, 1, 1]);
const v8 = N.mul(v7, v5);
const v9 = N.add(v3, v8);
const v10 = N.reshape(v1, [48, 1]);
const v11 = N.reshape(v10, [48, 1, 1]);
return {out0: v9, out1: v11};
}, {v0: k.tensor([48], "f32"), v1: k.tensor([48], "f32"), v2: k.tensor([512, 48, 56, 56], "f32")});
