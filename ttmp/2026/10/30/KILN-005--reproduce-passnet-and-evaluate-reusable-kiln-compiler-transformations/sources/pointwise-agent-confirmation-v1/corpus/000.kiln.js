const passnetProject = project("passnet").program(({v0, v1, v2, v3, v4, v5}) => {
const v6 = N.conv2d(v5, v0, null, {"stride": [1, 1], "padding": [0, 0], "dilation": [1, 1], "groups": 1});
const v7 = N.cast(N.add(N.mul(N.div(N.sub(N.cast(v6, "f32"), N.reshape(N.cast(v1, "f32"), [1, 1024, 1, 1])), N.sqrt(N.add(N.reshape(N.cast(v2, "f32"), [1, 1024, 1, 1]), 1e-05))), N.reshape(N.cast(v4, "f32"), [1, 1024, 1, 1])), N.reshape(N.cast(v3, "f32"), [1, 1024, 1, 1])), "f32");
return {out0: v7};
}, {v0: k.tensor([1024, 1280, 1, 1], "f32"), v1: k.tensor([1024], "f32"), v2: k.tensor([1024], "f32"), v3: k.tensor([1024], "f32"), v4: k.tensor([1024], "f32"), v5: k.tensor([1, 1280, 6, 6], "f32")});
const passnetReferenceInputs = passnetProject.inputsFor(passnetProject.graph(), {names: ["v2"]});
for (let i=0; i<passnetReferenceInputs.v2.data.length; i++) passnetReferenceInputs.v2.data[i] = Math.abs(passnetReferenceInputs.v2.data[i]) + 0.1;
passnetProject.data(passnetReferenceInputs);
