project("passnet").program(({v0, v1, v2, v3, v4}) => {
const v5 = N.cast(N.matmul(N.cast(v0, "f32"), N.cast(v1, "f32")), "bf16");
const v6 = N.reshape(v5, [64, 16, 31]);
const v7 = N.pad(v6, [0, 1], "constant", 0);
const v8 = N.reshape(v7, [64, 512]);
const v9 = N.pad(v8, [0, 15], "constant", 0);
const v10 = N.reshape(v9, [64, 17, 31]);
const v11 = N.reshape(N.slice(N.slice(v10, 1, 0, 16), 2, 15, 31), [64, 16, 16]);
const v12 = N.reshape(v11, [4, 16, 1, 16, 16]);
const v13 = N.expand(v12, [-1, -1, 16, -1, -1]);
const v14 = N.transpose(N.transpose(N.transpose(v13, 1, 3), 2, 3), 3, 4);
const v15 = N.add(v14, v2);
const v16 = N.reshape(v15, [4, 256, 256]);
const v17 = N.add(v3, v16);
const v18 = N.cast(N.softmax(N.cast(v17, "f32"), 2), "bf16");
const v19 = N.cast(N.matmul(N.cast(v18, "f32"), N.cast(v4, "f32")), "bf16");
const v20 = N.transpose(v19, 2, 1);
return {out0: v20};
}, {v0: k.tensor([4, 16, 16, 128], "bf16"), v1: k.tensor([128, 31], "bf16"), v2: k.tensor([4, 16, 16, 16, 16], "bf16"), v3: k.tensor([4, 256, 256], "bf16"), v4: k.tensor([4, 256, 128], "bf16")});
