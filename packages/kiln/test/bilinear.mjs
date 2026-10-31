import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Tensor} from '../src/core/util.js';
import {bilinearReference,bilinearSpec} from '../src/std/bilinear.js';
import {k} from '../src/core/kiln.js';
import {N,decomposition} from '../src/std/tensor.js';
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/bilinear-pytorch.json',import.meta.url),'utf8'));
const pipe=k.pipeline('resize').pass(decomposition).build();
for(const c of fixtures.cases){
 const input=new Tensor(c.shape,Float32Array.from(c.input));
 const graph=k.trace('resize',({x})=>({out:N.resizeBilinear(x,c.size)}),{x:k.tensor(c.shape)});
 const run=pipe.run(graph);assert.ok(run.ok,run.error?.message);
 for(const actual of [bilinearReference(input,c.size),run.graph.eval({x:input}).out]){
  assert.deepEqual(actual.shape,[...c.shape.slice(0,2),...c.size]);
  for(let i=0;i<actual.data.length;i++)assert.ok(Math.abs(actual.data[i]-c.output[i])<=1e-5+1.3e-6*Math.abs(c.output[i]),`value ${i}`);
 }
}
assert.throws(()=>bilinearSpec([1,1,2,2],[0,3]),/positive/);
console.log('bilinear reference and decomposition match PyTorch');
