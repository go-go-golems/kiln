import assert from 'node:assert/strict';
import {k} from '../src/core/kiln.js';
import {lift} from '../src/std/loop.js';
const pipe=k.pipeline('lift-only').pass(lift).build();
import {tensor,broadcastMap} from '../src/std/tensor.js';
for(const dtype of ['f32','f16','bf16']){
 const g=k.trace('typed-view',({x})=>({out:tensor.view(x,{shape:[1,2,3],map:broadcastMap([2,3],[1,2,3])})}),{x:k.tensor([2,3],dtype)});
 const run=pipe.run(g);assert.ok(run.ok,run.error?.message);
 const node=run.graph.nodes.get(run.graph.outputs[0].id);
 assert.equal(node.type.dtype,dtype);assert.equal(node.attrs.outDtype,dtype);
}
console.log('lowered view result dtype passed');
