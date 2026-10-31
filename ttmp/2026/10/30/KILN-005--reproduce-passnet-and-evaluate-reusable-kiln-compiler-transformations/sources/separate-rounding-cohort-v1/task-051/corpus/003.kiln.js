const passnetProject = project("passnet").program(({v0, v1, v2, v3, v4}) => {
const v5 = N.reshape(v0, [1, 256, 16, 16]);
const v6 = N.cast(N.add(N.mul(N.div(N.sub(N.cast(v5, "f32"), N.reshape(N.cast(v1, "f32"), [1, 256, 1, 1])), N.sqrt(N.add(N.reshape(N.cast(v2, "f32"), [1, 256, 1, 1]), 1e-05))), N.reshape(N.cast(v3, "f32"), [1, 256, 1, 1])), N.reshape(N.cast(v4, "f32"), [1, 256, 1, 1])), "bf16");
const v7 = N.cast(N.silu(N.cast(v6, "f32")), "bf16");
return {out0: v7};
}, {v0: k.tensor([4, 64, 256], "bf16"), v1: k.tensor([256], "bf16"), v2: k.tensor([256], "bf16"), v3: k.tensor([256], "bf16"), v4: k.tensor([256], "bf16")});
const passnetReferenceInputs = passnetProject.inputsFor(passnetProject.graph(), {names: ["v2"]});
for (let i=0; i<passnetReferenceInputs.v2.data.length; i++) passnetReferenceInputs.v2.data[i] = Math.abs(passnetReferenceInputs.v2.data[i]) + 0.1;
passnetProject.data(passnetReferenceInputs);
