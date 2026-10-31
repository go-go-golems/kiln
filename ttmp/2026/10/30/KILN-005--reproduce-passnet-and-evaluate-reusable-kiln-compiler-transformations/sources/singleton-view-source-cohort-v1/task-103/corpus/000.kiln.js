project("passnet").program(({v0, v1}) => {
const v2 = N.mul(v0, 0.458);
const v3 = N.add(v2, -0.030000000000000027);
const v4 = N.reshape(N.slice(v1, 1, 1, 2), [1, 32, 32]);
const v5 = N.reshape(v4, [1, 1, 32, 32]);
const v6 = N.mul(v5, 0.448);
const v7 = N.add(v6, -0.08799999999999997);
const v8 = N.reshape(N.slice(v1, 1, 2, 3), [1, 32, 32]);
const v9 = N.reshape(v8, [1, 1, 32, 32]);
const v10 = N.mul(v9, 0.45);
const v11 = N.add(v10, -0.18799999999999994);
const v12 = N.concat([v3, v7, v11], 1);
return {out0: v12};
}, {v0: k.tensor([1, 1, 32, 32], "bf16"), v1: k.tensor([1, 16, 32, 32], "bf16")});
