project("bilinear-fixture").program(({x}) => ({out:N.resizeBilinear(x,[3, 5])}), {x:k.tensor([2, 1, 3, 5])});
