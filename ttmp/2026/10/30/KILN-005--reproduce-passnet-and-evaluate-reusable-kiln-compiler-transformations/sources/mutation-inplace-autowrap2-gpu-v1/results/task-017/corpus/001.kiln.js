const passnetProject = project("passnet").program(({v0, v1, v2, v3, v4, v5, v6}) => {
const v7 = N.expect(N.conv2d(v0, v1, null, {"stride": [1, 1], "padding": [0, 0], "dilation": [1, 1], "groups": 1}), [128, 1024, 14, 14], "f32");
const v8 = N.expect(N.cast(N.add(N.mul(N.div(N.sub(N.cast(v7, "f32"), N.reshape(N.cast(v2, "f32"), [1, 1024, 1, 1])), N.sqrt(N.add(N.reshape(N.cast(v3, "f32"), [1, 1024, 1, 1]), 1e-05))), N.reshape(N.cast(v4, "f32"), [1, 1024, 1, 1])), N.reshape(N.cast(v5, "f32"), [1, 1024, 1, 1])), "f32"), [128, 1024, 14, 14], "f32");
const v9 = N.expect(N.add(v8, v6), [128, 1024, 14, 14], "f32");
return {out0: v9};
}, {v0: k.tensor([128, 256, 14, 14], "f32"), v1: k.tensor([1024, 256, 1, 1], "f32"), v2: k.tensor([1024], "f32"), v3: k.tensor([1024], "f32"), v4: k.tensor([1024], "f32"), v5: k.tensor([1024], "f32"), v6: k.tensor([128, 1024, 14, 14], "f32")});
const passnetReferenceInputs = passnetProject.inputsFor(passnetProject.graph(), {names: ["v3"]});
for (let i=0; i<passnetReferenceInputs.v3.data.length; i++) passnetReferenceInputs.v3.data[i] = Math.abs(passnetReferenceInputs.v3.data[i]) + 0.1;
passnetProject.data(passnetReferenceInputs);
