project("passnet").program(({v0, v1, v2, v3, v4}) => {
const v5 = N.relu(v4);
const v6 = N.add(N.mul(N.div(N.sub(v5, N.reshape(v0, [1, 128])), N.sqrt(N.add(N.reshape(v1, [1, 128]), 1e-05))), N.reshape(v3, [1, 128])), N.reshape(v2, [1, 128]));
const v7 = v6;
return {out0: v7};
}, {v0: k.tensor([128]), v1: k.tensor([128]), v2: k.tensor([128]), v3: k.tensor([128]), v4: k.tensor([1000, 128])})
.data({v0: new Tensor([128], new Float32Array(128)), v1: new Tensor([128], new Float32Array(128).fill(1)), v2: new Tensor([128], new Float32Array(128)), v3: new Tensor([128], new Float32Array(128).fill(1)), v4: Tensor.random([1000,128], {seed: 42, dist: "uniform"})});
