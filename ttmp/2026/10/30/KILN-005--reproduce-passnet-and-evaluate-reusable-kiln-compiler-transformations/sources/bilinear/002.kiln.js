project("bilinear-fixture").program(({x}) => ({out:N.resizeBilinear(x,[3, 4])}), {x:k.tensor([1, 1, 1, 1])});
