import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Tensor} from '../src/core/util.js';
import {k} from '../src/core/kiln.js';
import {T} from '../src/std/tensor.js';
import {maxPool2dSpec,maxPool2dReference,lowerMaxPool2d} from '../src/std/pooling.js';
import {pipeline} from '../src/std/emmy.js';
import {programOf,simulateKernel} from '../src/std/program.js';
import {SPECS,target} from '../src/std/targets.js';
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/max-pool2d-pytorch.json',import.meta.url)));
const trace=(shape,options)=>k.trace('max-pool',({x})=>({out:lowerMaxPool2d(T,x,options)}),{x:k.tensor(shape)});
for(const [index,f] of fixtures.cases.entries()){
 const x=new Tensor(f.input.shape,Float32Array.from(f.input.data));
 for(const out of [maxPool2dReference(x,f.options),trace(x.shape,f.options).eval({x}).out]){
  assert.deepEqual(out.shape,f.output.shape);
  assert.deepEqual(Array.from(out.data),f.output.data,`case ${index}`);
 }
}
for(const options of [{kernel_size:0},{kernel_size:2,padding:2},{kernel_size:2,stride:0},{kernel_size:2,dilation:0},{kernel_size:2,ceil_mode:1},{kernel_size:2,return_indices:true}])assert.throws(()=>maxPool2dSpec([1,2,4,4],options));
for(const data of [[NaN,-2,-3,-4,-5,-6,-7,-8,-9],Array(9).fill(-Infinity),[Infinity,-2,-3,-4,-5,-6,-7,-8,-9]]){
 const x=new Tensor([1,1,3,3],Float32Array.from(data));
 const options={kernel_size:2,stride:2,padding:1,ceil_mode:true};
 assert.deepEqual(Array.from(trace(x.shape,options).eval({x}).out.data),Array.from(maxPool2dReference(x,options).data));
}
// Dilation can leave a legal window containing no input samples.
const empty=new Tensor([1,1,1],Float32Array.of(-7)),emptyOptions={kernel_size:2,padding:1,dilation:2};
assert.deepEqual(Array.from(trace(empty.shape,emptyOptions).eval({x:empty}).out.data),[-Infinity]);
const hardware=target(SPECS.a100);
for(const f of [fixtures.cases[0],fixtures.cases[15],fixtures.cases.at(-1)]){
 const run=pipeline({target:hardware}).run(trace(f.input.shape,f.options),{params:{MAP:'thread'}});
 assert.ok(run.ok,run.error?.message);
 for(const kernel of programOf(run.graph).kernels){const check=simulateKernel(kernel,hardware).check;assert.ok(check.ok,JSON.stringify(check));}
}
console.log(`${fixtures.cases.length} max pooling CPU oracle/reference/lowering cases, NaN/inf/empty windows, validation, and three compiler/simulator cases passed.`);
