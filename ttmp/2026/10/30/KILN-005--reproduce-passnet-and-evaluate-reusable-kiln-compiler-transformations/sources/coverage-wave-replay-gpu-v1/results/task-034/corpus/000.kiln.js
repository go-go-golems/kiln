project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.expect(N.add(N.cast(N.transpose(N.transpose(N.transpose(N.reshape(N.linear(N.reshape(N.transpose(N.transpose(N.transpose(N.transpose(N.reshape(N.cast(v0, "f32"), [1, 3, 8, 2, 14, 16, 14, 16]), 1, 2), 2, 4), 3, 6), 5, 6), [1568, 1536]), N.reshape(N.cast(v1, "f32"), [768, 1536]), null), [1, 8, 14, 14, 768]), 1, 4), 2, 4), 3, 4), "bf16"), N.reshape(v2, [1, 768, 1, 1, 1])), [1, 768, 8, 14, 14], "bf16");
const v5 = N.expect(N.reshape(v4, [1, 768, 1568]), [1, 768, 1568], "bf16");
const v6 = N.expect(N.transpose(v5, 1, 2), [1, 1568, 768], "bf16");
const v7 = N.expect(v3, [1, 1568, 768], "bf16");
const v8 = N.expect(N.cast(v7, "bf16"), [1, 1568, 768], "bf16");
const v9 = N.expect(v8, [1, 1568, 768], "bf16");
const v10 = N.expect(N.add(v6, v9), [1, 1568, 768], "bf16");
return {out0: v10};
}, {v0: k.tensor([1, 3, 16, 224, 224], "bf16"), v1: k.tensor([768, 3, 2, 16, 16], "bf16"), v2: k.tensor([768], "bf16"), v3: k.tensor([1, 1568, 768], "bf16")});
