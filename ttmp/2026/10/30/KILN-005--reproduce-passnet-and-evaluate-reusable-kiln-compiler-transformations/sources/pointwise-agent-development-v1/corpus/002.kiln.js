const passnetProject = project("passnet").program(({v0, v1, v2, v3, v4, v5, v6}) => {
const v7 = N.conv2d(v5, v0, null, {"stride": [1, 1], "padding": [0, 0], "dilation": [1, 1], "groups": 1});
const v8 = N.add(v6, v7);
const v9 = N.cast(N.add(N.mul(N.div(N.sub(N.cast(v8, "f32"), N.reshape(N.cast(v1, "f32"), [1, 1296, 1, 1])), N.sqrt(N.add(N.reshape(N.cast(v2, "f32"), [1, 1296, 1, 1]), 1e-05))), N.reshape(N.cast(v4, "f32"), [1, 1296, 1, 1])), N.reshape(N.cast(v3, "f32"), [1, 1296, 1, 1])), "f32");
const v10 = N.cast(N.silu(N.cast(v9, "f32")), "f32");
return {out0: v10};
}, {v0: k.tensor([1296, 576, 1, 1], "f32"), v1: k.tensor([1296], "f32"), v2: k.tensor([1296], "f32"), v3: k.tensor([1296], "f32"), v4: k.tensor([1296], "f32"), v5: k.tensor([1, 576, 8, 8], "f32"), v6: k.tensor([1, 1296, 8, 8], "f32")});
const passnetReferenceInputs = passnetProject.inputsFor(passnetProject.graph(), {names: ["v2"]});
for (let i=0; i<passnetReferenceInputs.v2.data.length; i++) passnetReferenceInputs.v2.data[i] = Math.abs(passnetReferenceInputs.v2.data[i]) + 0.1;
passnetProject.data(passnetReferenceInputs);
