project("passnet").program(({v0, v1, v2, v3, v4, v5}) => {
const v6 = N.cast(N.linear(N.cast(v0, "f32"), N.cast(v1, "f32"), N.cast(v2, "f32")), "bf16");
const v7 = N.reshape(N.slice(v6, 1, 0, 256), [300, 256]);
const v8 = N.reshape(v7, [300, 256]);
const v9 = N.reshape(N.slice(v6, 1, 256, 512), [300, 256]);
const v10 = N.reshape(v9, [300, 256]);
const v11 = N.reshape(v3, [300, 1, 256]);
const v12 = N.cast(N.linear(N.cast(v11, "f32"), N.cast(v4, "f32"), N.cast(v5, "f32")), "bf16");
const v13 = N.reshape(N.slice(v12, 2, 0, 256), [300, 1, 256]);
const v14 = N.reshape(N.slice(v12, 2, 256, 512), [300, 1, 256]);
const v15 = N.reshape(v8, [300, 1, 256]);
return {out0: v13, out1: v14, out2: v10, out3: v15};
}, {v0: k.tensor([300, 256], "bf16"), v1: k.tensor([512, 256], "bf16"), v2: k.tensor([512], "bf16"), v3: k.tensor([1, 150, 1, 512], "bf16"), v4: k.tensor([512, 256], "bf16"), v5: k.tensor([512], "bf16")});
