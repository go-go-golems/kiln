import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Tensor} from '../src/core/util.js';
import {k} from '../src/core/kiln.js';
import {N,T,tensor,decomposition} from '../src/std/tensor.js';
import {padSpec,padReference,lowerPad,rollSpec,rollReference,lowerRoll} from '../src/std/layout.js';
import {pipeline} from '../src/std/emmy.js';
import {programOf,simulateKernel} from '../src/std/program.js';
import {SPECS,target} from '../src/std/targets.js';
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/layout-pytorch.json',import.meta.url)));
const pipe=k.pipeline('layout').pass(decomposition).build();
for(const f of fixtures.cases){
 const x=new Tensor(f.input.shape,Float32Array.from(f.input.data)),o=f.options;
 const args=f.op==='pad'?[o.pad,o.mode,o.value]:[o.shifts,o.dims];
 const ref=(f.op==='pad'?padReference:rollReference)(x,...args);
 const graph=k.trace('layout',({x})=>({out:(f.op==='pad'?lowerPad:lowerRoll)(T,x,...args)}),{x:k.tensor(x.shape)});
 const results=[ref,graph.eval({x}).out];
 if(N[f.op]){const high=k.trace('high-layout',({x})=>({out:N[f.op](x,...args)}),{x:k.tensor(x.shape)});const lowered=pipe.run(high);assert.ok(lowered.ok,lowered.error?.message);results.push(high.eval({x}).out,lowered.graph.eval({x}).out);}
 for(const result of results){assert.deepEqual(result.shape,f.output.shape);assert.deepEqual(Array.from(result.data),f.output.data,JSON.stringify(o));}
}
for(const mode of ['constant','reflect','replicate','circular'])assert.throws(()=>padSpec([2,3],[-4,0],mode));
assert.throws(()=>padSpec([2,3],[3,0],'reflect'));assert.throws(()=>padSpec([2,3],[4,0],'circular'));
assert.throws(()=>rollSpec([2,3],[1,2],null));assert.throws(()=>rollSpec([2,3],1,2));
for(const mode of ['constant','replicate']){
 const x=new Tensor([1,3],Float32Array.of(NaN,-0,Infinity));
 const g=k.trace('special',({x})=>({out:lowerPad(T,x,[1,1],mode,0)}),{x:k.tensor(x.shape)});
 assert.deepEqual(g.eval({x}).out.data,padReference(x,[1,1],mode,0).data);
}
console.log(`${fixtures.cases.length} PyTorch layout cases: references, indexed lowering, available frontend decomposition; invalid contracts and special values passed.`);

const hardware=target(SPECS.a100);
for(const index of [0,5,10,15,24,28]){
 const f=fixtures.cases[index],o=f.options,args=f.op==='pad'?[o.pad,o.mode,o.value]:[o.shifts,o.dims];
 const graph=k.trace('layout-compile',({x})=>({out:(f.op==='pad'?lowerPad:lowerRoll)(T,x,...args)}),{x:k.tensor(f.input.shape)});
 const run=pipeline({target:hardware}).run(graph,{params:{MAP:'thread'}});assert.ok(run.ok,run.error?.message);
 for(const kernel of programOf(run.graph).kernels){const check=simulateKernel(kernel,hardware).check;assert.ok(check.ok,JSON.stringify(check));}
}
console.log('Six layout compiler/simulator safety cases passed.');

for(const dtype of ['f16','bf16']){
 const x=new Tensor([2,3],Float32Array.of(1,2,3,4,5,6));
 const g=k.trace('typed-pad',({x})=>({out:lowerPad(T,x,[1,2],'constant',0,tensor)}),{x:k.tensor(x.shape,dtype)});
 assert.equal(g.nodes.get(g.outputs[0].id).type.dtype,dtype);
 assert.deepEqual(g.eval({x}).out.data,padReference(x,[1,2]).data);
 const run=pipeline({target:hardware}).run(g,{params:{MAP:'thread'}});assert.ok(run.ok,run.error?.message);
}
console.log('Typed padding reference and compiler cases passed.');
