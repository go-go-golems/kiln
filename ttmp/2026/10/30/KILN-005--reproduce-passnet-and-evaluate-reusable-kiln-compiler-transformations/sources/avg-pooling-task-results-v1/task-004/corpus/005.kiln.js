const passnetProject = project("passnet").program(({v0, v1, v2, v3, v4, v5, v6}) => {
const v7 = N.conv2d(v0, v1, null, {"stride": [1, 1], "padding": [1, 1], "dilation": [1, 1], "groups": 1});
const v8 = N.cast(N.add(N.mul(N.div(N.sub(N.cast(v7, "f32"), N.reshape(N.cast(v2, "f32"), [1, 256, 1, 1])), N.sqrt(N.add(N.reshape(N.cast(v3, "f32"), [1, 256, 1, 1]), 1e-05))), N.reshape(N.cast(v4, "f32"), [1, 256, 1, 1])), N.reshape(N.cast(v5, "f32"), [1, 256, 1, 1])), "bf16");
const v9 = N.avgPool2d(v6, {"kernel_size": [2, 2], "stride": [2, 2], "padding": [0, 0], "ceil_mode": true, "count_include_pad": false, "divisor_override": null});
return {out0: v9, out1: v8};
}, {v0: k.tensor([1, 256, 16, 16], "bf16"), v1: k.tensor([256, 256, 3, 3], "bf16"), v2: k.tensor([256], "bf16"), v3: k.tensor([256], "bf16"), v4: k.tensor([256], "bf16"), v5: k.tensor([256], "bf16"), v6: k.tensor([1, 128, 32, 32], "bf16")});
const passnetReferenceInputs = passnetProject.inputsFor(passnetProject.graph(), {names: ["v3"]});
for (let i=0; i<passnetReferenceInputs.v3.data.length; i++) passnetReferenceInputs.v3.data[i] = Math.abs(passnetReferenceInputs.v3.data[i]) + 0.1;
passnetProject.data(passnetReferenceInputs);
