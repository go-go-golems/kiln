project("passnet").program(({v0, v1, v2}) => {
const v3 = N.cast(N.softmax(N.cast(v0, "f32"), 3), "f32");
const v4 = N.reshape(v1, [1, 16, 1, 1]);
const v5 = N.cast(N.sigmoid(N.cast(v4, "f32")), "f32");
const v6 = N.sub(1.0, v5);
const v7 = N.mul(v6, v2);
const v8 = N.cast(N.sigmoid(N.cast(v4, "f32")), "f32");
const v9 = N.mul(v8, v3);
const v10 = N.add(v7, v9);
return {out0: v10};
}, {v0: k.tensor([1, 16, 196, 196], "f32"), v1: k.tensor([16], "f32"), v2: k.tensor([1, 16, 196, 196], "f32")});
