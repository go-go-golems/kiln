import assert from 'node:assert/strict';
import {Tensor} from '../src/core/util.js';
import {k} from '../src/core/kiln.js';
import {N,decomposition} from '../src/std/tensor.js';
import {concatReference,concatSpec} from '../src/std/concat.js';
const pipe=k.pipeline('concat').pass(decomposition).build();
for(const dtype of ['f32','f16','bf16']) for(const axis of [0,1,-1]) {
  const dim=axis<0?2+axis:axis;
  const shapes=dim===0?[[1,3],[2,3],[1,3]]:[[2,1],[2,2],[2,3]];
  const inputs=Object.fromEntries(shapes.map((shape,i)=>['x'+i,new Tensor(shape,Float32Array.from({length:shape[0]*shape[1]},(_,j)=>i*20+j))]));
  const spec=Object.fromEntries(shapes.map((shape,i)=>['x'+i,k.tensor(shape,dtype)]));
  const graph=k.trace('concat',({x0,x1,x2})=>({out:N.concat([x0,x1,x2],axis)}),spec);
  const run=pipe.run(graph);assert.ok(run.ok,run.error?.message);
  const expected=concatReference(Object.values(inputs),axis);
  for(const actual of [graph.eval(inputs).out,run.graph.eval(inputs).out]) {
    assert.deepEqual(actual.shape,expected.shape);
    assert.deepEqual(actual.data,expected.data);
  }
  assert.equal(run.graph.nodes.get(run.graph.outputs[0].id).type.dtype,dtype);
}
assert.throws(()=>concatSpec([],0),/at least one/);
assert.throws(()=>concatSpec([[2,3],[4,4]],0),/non-axis/);
assert.throws(()=>concatSpec([[2,3]],2),/axis/);
assert.throws(()=>concatSpec([[0,3]],0),/positive/);
// A select must preserve values rather than combine them arithmetically.
const special={a:new Tensor([1],Float32Array.of(NaN)),b:new Tensor([2],Float32Array.of(-0,Infinity))};
const graph=k.trace('special',({a,b})=>({out:N.concat([a,b])}),{a:k.tensor([1]),b:k.tensor([2])});
const actual=pipe.run(graph).graph.eval(special).out.data;
assert.ok(Number.isNaN(actual[0]));assert.ok(Object.is(actual[1],-0));assert.equal(actual[2],Infinity);
console.log('concatenation reference/decomposition/dtypes/special values passed');
