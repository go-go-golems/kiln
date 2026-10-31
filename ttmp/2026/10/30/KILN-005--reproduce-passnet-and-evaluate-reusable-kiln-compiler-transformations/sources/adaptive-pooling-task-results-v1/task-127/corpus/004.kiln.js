const passnetProject = project("passnet").program(({v0, v1, v2, v3, v4, v5, v6}) => {
const v7 = N.conv2d(v0, v1, null, {"stride": [1, 1], "padding": [1, 1], "dilation": [1, 1], "groups": 1});
const v8 = N.adaptiveAvgPool2d(v2, [1, 1]);
const v9 = N.cast(N.add(N.mul(N.div(N.sub(N.cast(v8, "f32"), N.reshape(N.cast(v3, "f32"), [1, 512, 1, 1])), N.sqrt(N.add(N.reshape(N.cast(v4, "f32"), [1, 512, 1, 1]), 1e-05))), N.reshape(N.cast(v5, "f32"), [1, 512, 1, 1])), N.reshape(N.cast(v6, "f32"), [1, 512, 1, 1])), "bf16");
const v10 = N.relu(v9);
return {out0: v7, out1: v10};
}, {v0: k.tensor([64, 128, 8, 8], "bf16"), v1: k.tensor([128, 128, 3, 3], "bf16"), v2: k.tensor([64, 512, 8, 8], "bf16"), v3: k.tensor([512], "bf16"), v4: k.tensor([512], "bf16"), v5: k.tensor([512], "bf16"), v6: k.tensor([512], "bf16")});
const passnetReferenceInputs = passnetProject.inputsFor(passnetProject.graph(), {names: ["v4"]});
for (let i=0; i<passnetReferenceInputs.v4.data.length; i++) passnetReferenceInputs.v4.data[i] = Math.abs(passnetReferenceInputs.v4.data[i]) + 0.1;
passnetProject.data(passnetReferenceInputs);
