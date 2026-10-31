project("conv-fixture").program(({x,w,b}) => ({out:N.conv2d(x,w,b,{"groups": 2, "padding": 1, "stride": 2})}), {x: k.tensor([2, 4, 5, 5]), w: k.tensor([6, 2, 3, 3]), b: k.tensor([6])});
