const passnetProject = project("passnet").program(({v0, v1, v2, v3, v4, v5, v6}) => {
const v7 = N.conv2d(v6, v4, null, {"stride": [1, 1], "padding": [1, 1], "dilation": [1, 1], "groups": 1});
const v8 = N.cast(N.add(N.mul(N.div(N.sub(N.cast(v7, "f32"), N.reshape(N.cast(v0, "f32"), [1, 256, 1, 1])), N.sqrt(N.add(N.reshape(N.cast(v1, "f32"), [1, 256, 1, 1]), 1e-05))), N.reshape(N.cast(v3, "f32"), [1, 256, 1, 1])), N.reshape(N.cast(v2, "f32"), [1, 256, 1, 1])), "f16");
const v9 = N.avgPool2d(v5, {"kernel_size": [2, 2], "stride": [2, 2], "padding": [0, 0], "ceil_mode": true, "count_include_pad": false, "divisor_override": null});
return {out0: v9, out1: v8};
}, {v0: k.tensor([256], "f16"), v1: k.tensor([256], "f16"), v2: k.tensor([256], "f16"), v3: k.tensor([256], "f16"), v4: k.tensor([256, 256, 3, 3], "f16"), v5: k.tensor([32, 128, 48, 48], "f16"), v6: k.tensor([32, 256, 24, 24], "f16")});
const passnetReferenceInputs = passnetProject.inputsFor(passnetProject.graph(), {names: ["v1"]});
for (let i=0; i<passnetReferenceInputs.v1.data.length; i++) passnetReferenceInputs.v1.data[i] = Math.abs(passnetReferenceInputs.v1.data[i]) + 0.1;
passnetProject.data(passnetReferenceInputs);
