import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Tensor} from '../src/core/util.js';
import {k} from '../src/core/kiln.js';
import {N,decomposition} from '../src/std/tensor.js';
import {pipeline} from '../src/std/emmy.js';
import {target,SPECS} from '../src/std/targets.js';
const cases=JSON.parse(readFileSync(new URL('./fixtures/view-batch-pytorch.json',import.meta.url))).cases;
const frontend=k.pipeline('view-batch').pass(decomposition).build();
for(const item of cases){
 const x=new Tensor(item.input.shape,Float32Array.from(item.input.data));
 const graph=k.trace('view-batch',({x})=>({out:item.op==='expand'?N.expand(x,item.options.shape):N.unfold(x,item.options.axis,item.options.size,item.options.step)}),{x:k.tensor(item.input.shape,item.dtype)});
 const run=frontend.run(graph);assert.ok(run.ok,run.error?.message);
 for(const result of [graph.eval({x}).out,run.graph.eval({x}).out]){
  assert.deepEqual(result.shape,item.output.shape);assert.deepEqual(Array.from(result.data),item.output.data);
 }
 const compiled=pipeline({target:target(SPECS.a100)}).run(graph,{params:{MAP:'thread'}});assert.ok(compiled.ok,compiled.error?.message);
}
console.log(`${cases.length} PyTorch expand/unfold oracle and compiler cases passed.`);
