project("typed-transpose-bf16").program(({x}) => ({out: N.transpose(x,0,1)}), {x: k.tensor([2,3], "bf16")});
