project("passnet").program(({v0}) => {
const v1 = N.mul(0.5, v0);
const v2 = N.cast(N.pow(N.cast(v0, "f32"), 3.0), "f16");
const v3 = N.mul(0.044715, v2);
const v4 = N.add(v0, v3);
const v5 = N.mul(0.7978845608028654, v4);
const v6 = N.tanh(v5);
const v7 = N.add(1.0, v6);
const v8 = N.mul(v1, v7);
return {out0: v8};
}, {v0: k.tensor([2, 1024, 3072], "f16")});
