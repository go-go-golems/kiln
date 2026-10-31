project("f32-cancellation").program(({x}) => ({out:N.cast(N.sub(N.add(x,1),100000000),"bf16")}), {x:k.tensor([1],"f32")}).data({x:new Tensor([1],Float32Array.of(100000000))});
