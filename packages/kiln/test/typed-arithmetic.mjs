import assert from 'node:assert/strict';
import {k} from '../src/core/kiln.js';
import {N} from '../src/std/tensor.js';
import {Tensor} from '../src/core/util.js';
for(const dtype of ['f16','bf16']){
 const graph=k.trace('typed-add',({x,y})=>({out:N.add(N.add(x,y),1)}),{x:k.tensor([1],dtype),y:k.tensor([1],dtype)});
 const out=graph.nodes.get(graph.outputs[0].id);
 assert.equal(out.type.dtype,dtype);
 const half=dtype==='f16'?2**-11:2**-8;
 const got=graph.eval({x:new Tensor([1],Float32Array.of(1)),y:new Tensor([1],Float32Array.of(half))});
 assert.equal(got.out.data[0],2,'intermediate midpoint must round before adding 1');
}
console.log('typed elementwise inference/reference passed');
