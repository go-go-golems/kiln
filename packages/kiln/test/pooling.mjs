import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Tensor} from '../src/core/util.js';
import {k} from '../src/core/kiln.js';
import {N,decomposition} from '../src/std/tensor.js';
import {avgPool2dSpec,avgPool2dReference} from '../src/std/pooling.js';
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/avg-pool2d-pytorch.json',import.meta.url)));
const pipe=k.pipeline('pool-reference').pass(decomposition).build();
for(const [index,f] of fixtures.cases.entries()){
 const x=new Tensor(f.input.shape,Float32Array.from(f.input.data));
 const graph=k.trace('pool',({x})=>({out:N.avgPool2d(x,f.options)}),{x:k.tensor(x.shape)});
 const lowered=pipe.run(graph);assert.ok(lowered.ok,lowered.error?.message);
 for(const out of [avgPool2dReference(x,f.options),lowered.graph.eval({x}).out]){
  assert.deepEqual(out.shape,f.output.shape);
  for(let i=0;i<out.data.length;i++)assert.ok(Math.abs(out.data[i]-f.output.data[i])<=2e-6,`case ${index}, value ${i}: ${out.data[i]} vs ${f.output.data[i]}`);
 }
}
for(const options of [{kernel_size:0},{kernel_size:2,padding:2},{kernel_size:2,stride:0},{kernel_size:2,divisor_override:0},{kernel_size:2,ceil_mode:1}])assert.throws(()=>avgPool2dSpec([1,2,4,4],options));
// Masked clamped reads must not propagate a NaN into a window that excludes it.
const x=new Tensor([1,1,3,3],Float32Array.of(NaN,2,3,4,5,6,7,8,9));
const options={kernel_size:2,stride:2,padding:1,ceil_mode:true,count_include_pad:false};
const graph=k.trace('nan-mask',({x})=>({out:N.avgPool2d(x,options)}),{x:k.tensor(x.shape)});
const out=pipe.run(graph).graph.eval({x}).out,ref=avgPool2dReference(x,options);
assert.deepEqual(Array.from(out.data),Array.from(ref.data));
console.log(`${fixtures.cases.length} PyTorch average-pooling cases passed reference and decomposition; invalid parameters and NaN masking passed.`);
