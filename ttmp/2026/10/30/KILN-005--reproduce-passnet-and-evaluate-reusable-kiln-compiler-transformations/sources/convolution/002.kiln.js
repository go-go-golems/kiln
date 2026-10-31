project("conv-fixture").program(({x,w,b}) => ({out:N.conv2d(x,w,b,{"groups": 3, "dilation": [2, 1], "padding": [1, 2]})}), {x: k.tensor([1, 3, 6, 7]), w: k.tensor([3, 1, 2, 3]), b: k.tensor([3])});
