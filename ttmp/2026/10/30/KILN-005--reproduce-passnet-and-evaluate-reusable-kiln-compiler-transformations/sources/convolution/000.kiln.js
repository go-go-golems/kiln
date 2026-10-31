project("conv-fixture").program(({x,w,b}) => ({out:N.conv2d(x,w,b,{})}), {x: k.tensor([1, 2, 5, 6]), w: k.tensor([3, 2, 3, 2]), b: k.tensor([3])});
