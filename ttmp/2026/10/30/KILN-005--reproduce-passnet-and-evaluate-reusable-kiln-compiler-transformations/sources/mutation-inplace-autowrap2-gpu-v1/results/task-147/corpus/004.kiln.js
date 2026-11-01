project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.expect(N.cast(N.linear(N.cast(v0, "f32"), N.cast(v1, "f32"), N.cast(v2, "f32")), "f32"), [1000, 128], "f32");
const v5 = N.expect(N.add(v3, v4), [1000, 128], "f32");
const v6 = N.expect(N.relu(v5), [1000, 128], "f32");
return {out0: v6};
}, {v0: k.tensor([1000, 128], "f32"), v1: k.tensor([128, 128], "f32"), v2: k.tensor([128], "f32"), v3: k.tensor([1000, 128], "f32")});
