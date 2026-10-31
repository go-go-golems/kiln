import assert from 'node:assert/strict';
import {k} from '../src/core/kiln.js';
import {N} from '../src/std/tensor.js';
import {Tensor} from '../src/core/util.js';
for(const dtype of ['f16','bf16']){
 const g=k.trace('cast',({x})=>({out:N.cast(N.cast(x,dtype),'f32')}),{x:k.tensor([1])});
 assert.equal(g.nodes.get(g.outputs[0].id).type.dtype,'f32');
 const midpoint=1+2**(dtype==='f16'?-11:-8);
 assert.equal(g.eval({x:new Tensor([1],Float32Array.of(midpoint))}).out.data[0],1);
}
assert.throws(()=>k.trace('bad',({x})=>N.cast(x,'typo'),{x:k.tensor([1])}),/unsupported floating cast/);
console.log('explicit floating casts passed');
