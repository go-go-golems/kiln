import assert from 'node:assert/strict';
import {Project} from '../src/std/index.js';
import {N} from '../src/std/tensor.js';
import {k} from '../src/core/kiln.js';
import {Tensor} from '../src/core/util.js';
import {roundToDtype} from '../src/core/dtypes.js';
for(const dtype of ['f16','bf16']) {
 const project=new Project('typed').program(({x})=>({out:N.concat([x,x])}),{x:k.tensor([4],dtype)});
 const graph=project.graph();
 const generated=project.inputsFor(graph).x;
 assert.ok(generated.data.every(x=>Object.is(x,roundToDtype(x,dtype))));
 const original=Float32Array.of(0.27976566553115845,1.0005,-0,Infinity);
 const snapshot=original.slice();
 project.data({x:new Tensor([4],original)});
 const actual=project.inputsFor(graph).x;
 assert.notEqual(actual.data,original);
 assert.deepEqual(original,snapshot,'caller data remains unchanged');
 assert.deepEqual(actual.data,Float32Array.from(original,x=>roundToDtype(x,dtype)));
}
console.log('project reference inputs honor low-precision storage without mutating caller data');
