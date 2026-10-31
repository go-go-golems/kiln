const passnetProject = project("passnet").program(({v0, v1, v2, v3, v4, v5, v6, v7}) => {
const v8 = N.cast(N.linear(N.cast(v0, "f32"), N.cast(v1, "f32"), N.cast(v2, "f32")), "bf16");
const v9 = N.cast(N.add(N.mul(N.div(N.sub(N.cast(v3, "f32"), N.reshape(N.cast(v4, "f32"), [1, 384])), N.sqrt(N.add(N.reshape(N.cast(v5, "f32"), [1, 384]), 1e-05))), N.reshape(N.cast(v6, "f32"), [1, 384])), N.reshape(N.cast(v7, "f32"), [1, 384])), "bf16");
return {out0: v8, out1: v9};
}, {v0: k.tensor([1, 384], "bf16"), v1: k.tensor([1000, 384], "bf16"), v2: k.tensor([1000], "bf16"), v3: k.tensor([1, 384], "bf16"), v4: k.tensor([384], "bf16"), v5: k.tensor([384], "bf16"), v6: k.tensor([384], "bf16"), v7: k.tensor([384], "bf16")});
const passnetReferenceInputs = passnetProject.inputsFor(passnetProject.graph(), {names: ["v5"]});
for (let i=0; i<passnetReferenceInputs.v5.data.length; i++) passnetReferenceInputs.v5.data[i] = Math.abs(passnetReferenceInputs.v5.data[i]) + 0.1;
passnetProject.data(passnetReferenceInputs);
