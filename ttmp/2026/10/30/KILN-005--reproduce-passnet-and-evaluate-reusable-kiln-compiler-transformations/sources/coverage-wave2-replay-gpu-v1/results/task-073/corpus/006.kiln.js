const passnetProject = project("passnet").program(({v0, v1, v2, v3, v4, v5, v6, v7}) => {
const v8 = N.expect(N.conv2d(v0, v1, v2, {"stride": [1, 1], "padding": [0, 0], "dilation": [1, 1], "groups": 224}), [32, 224, 16, 16], "f16");
const v9 = N.expect(N.add(v3, v8), [32, 224, 16, 16], "f16");
const v10 = N.expect(N.add(v9, v0), [32, 224, 16, 16], "f16");
const v11 = N.expect(N.cast(N.add(N.mul(N.div(N.sub(N.cast(v10, "f32"), N.reshape(N.cast(v4, "f32"), [1, 224, 1, 1])), N.sqrt(N.add(N.reshape(N.cast(v5, "f32"), [1, 224, 1, 1]), 1e-05))), N.reshape(N.cast(v6, "f32"), [1, 224, 1, 1])), N.reshape(N.cast(v7, "f32"), [1, 224, 1, 1])), "f16"), [32, 224, 16, 16], "f16");
const v12 = N.expect(N.cast(N.mul(N.sum(N.sum(N.cast(v11, "f32"), 2, true), 3, true), 0.00390625), "f16"), [32, 224, 1, 1], "f16");
return {out0: v11, out1: v12};
}, {v0: k.tensor([32, 224, 16, 16], "f16"), v1: k.tensor([224, 1, 1, 1], "f16"), v2: k.tensor([224], "f16"), v3: k.tensor([32, 224, 16, 16], "f16"), v4: k.tensor([224], "f16"), v5: k.tensor([224], "f16"), v6: k.tensor([224], "f16"), v7: k.tensor([224], "f16")});
const passnetReferenceInputs = passnetProject.inputsFor(passnetProject.graph(), {names: ["v5"]});
for (let i=0; i<passnetReferenceInputs.v5.data.length; i++) passnetReferenceInputs.v5.data[i] = Math.abs(passnetReferenceInputs.v5.data[i]) + 0.1;
passnetProject.data(passnetReferenceInputs);
