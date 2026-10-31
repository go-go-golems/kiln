project("typed-arithmetic-f16").program(({x,y}) => ({out: N.mul(N.add(x,y), 0.5)}), {x: k.tensor([32], "f16"), y: k.tensor([32], "f16")});
