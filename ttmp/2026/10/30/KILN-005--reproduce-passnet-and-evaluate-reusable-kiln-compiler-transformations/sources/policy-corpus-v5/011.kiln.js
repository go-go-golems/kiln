const passnetProject = project("passnet").program(({v0, v1, v2, v3, v4, v5, v6, v7}) => {
const v8 = N.conv2d(v7, v4, null, {"stride": [2, 2], "padding": [3, 3], "dilation": [1, 1], "groups": 48});
const v9 = N.concat([v5, v6, v8], 1);
const v10 = N.cast(N.add(N.mul(N.div(N.sub(N.cast(v9, "f32"), N.reshape(N.cast(v0, "f32"), [1, 144, 1, 1])), N.sqrt(N.add(N.reshape(N.cast(v1, "f32"), [1, 144, 1, 1]), 1e-05))), N.reshape(N.cast(v3, "f32"), [1, 144, 1, 1])), N.reshape(N.cast(v2, "f32"), [1, 144, 1, 1])), "f32");
const v11 = N.cast(N.silu(N.cast(v10, "f32")), "f32");
const v12 = N.cast(N.mul(N.sum(N.sum(N.cast(v11, "f32"), 2, true), 3, true), 0.0012755102040816326), "f32");
return {out0: v11, out1: v12};
}, {v0: k.tensor([144], "f32"), v1: k.tensor([144], "f32"), v2: k.tensor([144], "f32"), v3: k.tensor([144], "f32"), v4: k.tensor([48, 1, 7, 7], "f32"), v5: k.tensor([1, 48, 28, 28], "f32"), v6: k.tensor([1, 48, 28, 28], "f32"), v7: k.tensor([1, 48, 56, 56], "f32")});
const passnetReferenceInputs = passnetProject.inputsFor(passnetProject.graph(), {names: ["v1"]});
for (let i=0; i<passnetReferenceInputs.v1.data.length; i++) passnetReferenceInputs.v1.data[i] = Math.abs(passnetReferenceInputs.v1.data[i]) + 0.1;
passnetProject.data(passnetReferenceInputs);
