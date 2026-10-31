project("passnet").program(({v0, v1, v2, v3}) => {
const v4 = N.cast(N.linear(N.cast(v0, "f32"), N.cast(v1, "f32"), N.cast(v2, "f32")), "f32");
const v5 = N.transpose(N.transpose(v4, 1, 3), 2, 3);
const v6 = N.transpose(v3, -2, -1);
return {out0: v5, out1: v6};
}, {v0: k.tensor([1, 196, 196, 3], "f32"), v1: k.tensor([16, 3], "f32"), v2: k.tensor([16], "f32"), v3: k.tensor([1, 16, 196, 48], "f32")});
