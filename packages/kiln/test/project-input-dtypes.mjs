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
// Configuring a small reference domain must not allocate an unrelated 1.6 GB input.
const large=new Project('selective').program(({huge,v})=>({out:huge,variance:v}),{
 huge:k.tensor([512,256,56,56],'f16'),v:k.tensor([256],'bf16')
});
const largeGraph=large.graph();
const subset=large.inputsFor(largeGraph,{names:['v']});
assert.deepEqual(Object.keys(subset),['v']);
assert.equal(subset.v.data.length,256);
assert.ok(subset.v.data.every(x=>Object.is(x,roundToDtype(x,'bf16'))));
for(const names of [['missing'],['v','v']])assert.throws(()=>large.inputsFor(largeGraph,{names}),/distinct graph inputs/);
assert.deepEqual(large.inputsFor(largeGraph,{names:[]}),{});
console.log('project reference inputs honor low-precision storage without mutating caller data');
