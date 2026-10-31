project("bilinear-fixture").program(({x}) => ({out:N.resizeBilinear(x,[7, 6])}), {x:k.tensor([1, 2, 3, 4])});
