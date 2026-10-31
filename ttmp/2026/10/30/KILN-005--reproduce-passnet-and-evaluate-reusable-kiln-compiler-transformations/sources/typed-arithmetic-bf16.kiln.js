project("typed-arithmetic-bf16").program(({x,y}) => ({out: N.mul(N.add(x,y), 0.5), cancellation: N.sub(N.add(x,y),x)}), {x: k.tensor([32], "bf16"), y: k.tensor([32], "bf16")});
