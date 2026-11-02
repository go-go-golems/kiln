import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Tensor} from '../src/core/util.js';
import {k} from '../src/core/kiln.js';
import {N,decomposition} from '../src/std/tensor.js';
import {adaptiveAvgPool2dSpec,adaptiveAvgPool2dReference} from '../src/std/pooling.js';
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/adaptive-avg-pool2d-pytorch.json',import.meta.url)));
const pipe=k.pipeline('adaptive-reference').pass(decomposition).build();
for(const [index,f] of fixtures.cases.entries()){
 const x=new Tensor(f.input.shape,Float32Array.from(f.input.data));
 const graph=k.trace('adaptive',({x})=>({out:N.adaptiveAvgPool2d(x,f.output_size)}),{x:k.tensor(x.shape,f.input.dtype)});
 const lowered=pipe.run(graph);assert.ok(lowered.ok,lowered.error?.message);
 for(const out of [graph.eval({x}).out,lowered.graph.eval({x}).out]){
  assert.deepEqual(out.shape,f.output.shape);
  const tol={f32:1e-6,f16:0.002,bf16:0.02}[f.input.dtype];
  for(let i=0;i<out.data.length;i++)assert.ok(Math.abs(out.data[i]-f.output.data[i])<=tol,`case ${index}, element ${i}: ${out.data[i]} vs ${f.output.data[i]}`);
 }
}
for(const size of [0,-1,true,[],[1],[1,2,3],[1,0],[1,false]])assert.throws(()=>adaptiveAvgPool2dSpec([1,2,4,4],size));
const x=new Tensor([1,1,5,5],Float32Array.from({length:25},(_,i)=>i===12?NaN:i));
const graph=k.trace('adaptive-nan',({x})=>({out:N.adaptiveAvgPool2d(x,[3,3])}),{x:k.tensor(x.shape)});
assert.deepEqual(Array.from(pipe.run(graph).graph.eval({x}).out.data),Array.from(adaptiveAvgPool2dReference(x,[3,3]).data));
console.log(`${fixtures.cases.length} adaptive pooling reference/decomposition oracle cases passed; invalid sizes and NaN masking passed.`);
