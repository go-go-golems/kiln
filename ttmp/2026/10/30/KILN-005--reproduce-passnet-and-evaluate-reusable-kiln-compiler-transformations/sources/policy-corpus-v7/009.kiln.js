const passnetProject = project("passnet").program(({v0, v1, v2, v3, v4, v5, v6}) => {
const v7 = N.conv2d(v6, v4, null, {"stride": [1, 1], "padding": [2, 2], "dilation": [1, 1], "groups": 240});
const v8 = N.concat([v5, v7], 1);
const v9 = N.cast(N.add(N.mul(N.div(N.sub(N.cast(v8, "f32"), N.reshape(N.cast(v0, "f32"), [1, 480, 1, 1])), N.sqrt(N.add(N.reshape(N.cast(v1, "f32"), [1, 480, 1, 1]), 1e-05))), N.reshape(N.cast(v3, "f32"), [1, 480, 1, 1])), N.reshape(N.cast(v2, "f32"), [1, 480, 1, 1])), "f32");
const v10 = N.cast(N.silu(N.cast(v9, "f32")), "f32");
const v11 = N.cast(N.mul(N.sum(N.sum(N.cast(v10, "f32"), 2, true), 3, true), 0.001736111111111111), "f32");
return {out0: v10, out1: v11};
}, {v0: k.tensor([480], "f32"), v1: k.tensor([480], "f32"), v2: k.tensor([480], "f32"), v3: k.tensor([480], "f32"), v4: k.tensor([240, 1, 5, 5], "f32"), v5: k.tensor([1, 240, 24, 24], "f32"), v6: k.tensor([1, 240, 24, 24], "f32")});
const passnetReferenceInputs = passnetProject.inputsFor(passnetProject.graph(), {names: ["v1"]});
for (let i=0; i<passnetReferenceInputs.v1.data.length; i++) passnetReferenceInputs.v1.data[i] = Math.abs(passnetReferenceInputs.v1.data[i]) + 0.1;
passnetProject.data(passnetReferenceInputs);
