import assert from 'node:assert/strict';
import {k} from '../src/core/kiln.js';
import {N,T} from '../src/std/tensor.js';
for(const dtype of ['f32','f16','bf16','u8','i64']){
 const graph=k.trace('views',({x})=>({reshape:N.reshape(x,[3,2]),transpose:N.transpose(x,0,1),slice:N.slice(x,1,0,2),broadcast:T.bc(x,[1,2,3])}),{x:k.tensor([2,3],dtype)});
 for(const output of graph.outputs) assert.equal(graph.nodes.get(output.id).type.dtype,dtype,`${dtype}: ${output.name}`);
}
console.log('view dtype preservation passed');
