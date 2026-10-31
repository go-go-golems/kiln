project("bilinear-fixture").program(({x}) => ({out:N.resizeBilinear(x,[2, 3])}), {x:k.tensor([1, 1, 7, 5])});
