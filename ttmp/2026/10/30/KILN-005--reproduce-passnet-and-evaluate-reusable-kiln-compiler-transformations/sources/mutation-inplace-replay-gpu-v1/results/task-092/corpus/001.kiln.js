project("passnet").program(({v0}) => {
const v1 = N.expect(N.cast(N.silu(N.cast(v0, "f32")), "f16"), [1, 384, 7, 7], "f16");
const v2 = N.expect(N.cast(N.reshape(N.mul(N.sum(N.sum(N.cast(v1, "f32"), 2, true), 3, true), 0.02040816326530612), [1, 384]), "f16"), [1, 384], "f16");
const v3 = N.expect(N.reshape(v2, [1, 1, 384]), [1, 1, 384], "f16");
return {out0: v3, __mut0: v1};
}, {v0: k.tensor([1, 384, 7, 7], "f16")});
