import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Tensor} from '../src/core/util.js';
import {conv2dReference,conv2dSpec} from '../src/std/conv2d.js';
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/conv2d-pytorch.json',import.meta.url),'utf8'));
const tensor=v=>new Tensor(v.shape,Float32Array.from(v.data));
for(const fixture of fixtures.cases){
 const actual=conv2dReference(tensor(fixture.input),tensor(fixture.weight),tensor(fixture.bias),fixture.options);
 assert.deepEqual(actual.shape,fixture.output.shape);
 for(let i=0;i<actual.data.length;i++)assert.ok(Math.abs(actual.data[i]-fixture.output.data[i])<=1e-5+1.3e-6*Math.abs(fixture.output.data[i]),`value ${i}`);
}
assert.throws(()=>conv2dSpec([1,3,5,5],[4,2,3,3],{groups:2}),/mismatch/);
assert.throws(()=>conv2dSpec([1,2,1,1],[3,2,5,5]),/positive/);
assert.throws(()=>conv2dSpec([1,2,5,5],[3,2,3,3],{stride:0}),/invalid/);
console.log('grouped/strided/dilated conv2d reference agrees with PyTorch');
import {k} from '../src/core/kiln.js';
import {N,decomposition} from '../src/std/tensor.js';
const pipe=k.pipeline('conv-reference-lowering').pass(decomposition).build();
for(const fixture of fixtures.cases){
 const graph=k.trace('conv',({x,w,b})=>({out:N.conv2d(x,w,b,fixture.options)}),{x:k.tensor(fixture.input.shape),w:k.tensor(fixture.weight.shape),b:k.tensor(fixture.bias.shape)});
 const lowered=pipe.run(graph);assert.ok(lowered.ok,lowered.error?.message);
 const actual=lowered.graph.eval({x:tensor(fixture.input),w:tensor(fixture.weight),b:tensor(fixture.bias)}).out;
 assert.deepEqual(actual.shape,fixture.output.shape);
 for(let i=0;i<actual.data.length;i++)assert.ok(Math.abs(actual.data[i]-fixture.output.data[i])<=1e-5+1.3e-6*Math.abs(fixture.output.data[i]),`lowered value ${i}`);
}
console.log('convolution decomposition agrees with PyTorch');
