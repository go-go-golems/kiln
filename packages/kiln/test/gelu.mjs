import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {k} from '../src/core/kiln.js';
import {Tensor} from '../src/core/util.js';
import {N} from '../src/std/tensor.js';
import {erf} from '../src/std/special.js';
import {pipeline} from '../src/std/emmy.js';
import {target,SPECS} from '../src/std/targets.js';
import {programOf} from '../src/std/program.js';
import {exportProgram} from '../src/std/export.js';
const oracle=JSON.parse(readFileSync(new URL('./fixtures/gelu-reference.json',import.meta.url)));
let maxErfError=0;
for(let i=0;i<oracle.erf_input.length;i++){
 const error=Math.abs(erf(oracle.erf_input[i])-oracle.erf_expected[i]);
 maxErfError=Math.max(maxErfError,error);assert.ok(error<1e-13,`erf error ${error}`);
}
assert.ok(Object.is(erf(-0),-0));assert.equal(erf(Infinity),1);assert.equal(erf(-Infinity),-1);assert.ok(Number.isNaN(erf(NaN)));
const pipe=pipeline({target:target(SPECS.a100),contraction:'separate'});
for(const row of oracle.gelu){
 const shape=[row.input.length];
 // Explicit operation-math widening/narrowing matches the source binder.
 const graph=k.trace('gelu',({x})=>({out:N.cast(N.gelu(N.cast(x,'f32'),row.approximate),row.dtype)}),{x:k.tensor(shape,row.dtype)});
 const run=pipe.run(graph);assert.ok(run.ok,run.error?.message);
 const input={x:new Tensor(shape,Float32Array.from(row.input))};
 for(const got of [graph.eval(input).out,run.at('loop').eval(input).out]){
  assert.deepEqual(got.shape,shape);
  const rtol={f32:1.3e-6,f16:1e-3,bf16:1.6e-2}[row.dtype];
  for(let i=0;i<row.expected.length;i++)assert.ok(Math.abs(got.data[i]-row.expected[i])<=1e-5+rtol*Math.abs(row.expected[i]),`${row.dtype}/${row.approximate} at ${row.input[i]}: ${got.data[i]} != ${row.expected[i]}`);
 }
 const program=exportProgram(run,programOf(run.graph));
 assert.equal(program.outputs[0].dtype,row.dtype);
 if(row.approximate==='none'){
  assert.ok(program.kernels.some(kernel=>kernel.cuda.includes('erff(')));
  assert.ok(program.kernels.every(kernel=>kernel.wgsl===null));
 }
}
// The existing API continues to select tanh, and invalid selectors fail early.
const make=approximate=>k.trace('selector',({x})=>N.gelu(x,approximate),{x:k.tensor([3])});
const input={x:new Tensor([3],Float32Array.of(-3,0,3))};
assert.deepEqual(make(undefined).eval(input).out.data,make('tanh').eval(input).out.data);
assert.throws(()=>make('fast'),/approximate/);
console.log(`Independent GELU oracles passed for both modes/all storage dtypes; maximum erf error ${maxErfError}`);
