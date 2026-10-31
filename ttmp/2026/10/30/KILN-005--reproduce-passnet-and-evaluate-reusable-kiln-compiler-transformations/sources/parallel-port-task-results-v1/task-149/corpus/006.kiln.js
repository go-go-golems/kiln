const passnetProject = project("passnet").program(({v0, v1, v2, v3, v4, v5}) => {
const v6 = N.maxPool2d(v0, {"kernel_size": [2, 2], "stride": [2, 2], "padding": [0, 0], "dilation": [1, 1], "ceil_mode": false, "return_indices": false});
const v7 = N.resizeBilinear(v6, [128, 128]);
const v8 = N.concat([v1, v7], 1);
const v9 = N.cast(N.add(N.mul(N.div(N.sub(N.cast(v8, "f32"), N.reshape(N.cast(v2, "f32"), [1, 64, 1, 1])), N.sqrt(N.add(N.reshape(N.cast(v3, "f32"), [1, 64, 1, 1]), 0.001))), N.reshape(N.cast(v4, "f32"), [1, 64, 1, 1])), N.reshape(N.cast(v5, "f32"), [1, 64, 1, 1])), "bf16");
const v10 = N.relu(v9);
return {out0: v10};
}, {v0: k.tensor([32, 16, 256, 256], "bf16"), v1: k.tensor([32, 48, 128, 128], "bf16"), v2: k.tensor([64], "bf16"), v3: k.tensor([64], "bf16"), v4: k.tensor([64], "bf16"), v5: k.tensor([64], "bf16")});
const passnetReferenceInputs = passnetProject.inputsFor(passnetProject.graph(), {names: ["v3"]});
for (let i=0; i<passnetReferenceInputs.v3.data.length; i++) passnetReferenceInputs.v3.data[i] = Math.abs(passnetReferenceInputs.v3.data[i]) + 0.1;
passnetProject.data(passnetReferenceInputs);
