import assert from 'node:assert/strict';
import {k} from '../src/core/kiln.js';
import {Tensor} from '../src/core/util.js';
import {N,decomposition} from '../src/std/tensor.js';
import {matmulSpec} from '../src/std/matmul.js';
const pipe=k.pipeline('matrix-semantics').pass(decomposition).build();
const seq=(shape)=>new Tensor(shape,Float32Array.from({length:shape.reduce((a,b)=>a*b,1)},(_,i)=>i+1));
const cases=[
 [seq([2,3]),seq([3,2]),[2,2],[22,28,49,64]],
 [seq([3]),new Tensor([3],Float32Array.of(4,5,6)),[],[32]],
 [seq([3]),seq([3,2]),[2],[22,28]],
 [seq([2,3]),new Tensor([3],Float32Array.of(4,5,6)),[2],[32,77]],
 [seq([3]),seq([2,3,2]),[2,2],[22,28,58,64]],
 [seq([2,2,3]),new Tensor([3],Float32Array.of(4,5,6)),[2,2],[32,77,122,167]],
 [new Tensor([2,1,2,3],Float32Array.from({length:12},(_,i)=>i<6?1:2)),
  new Tensor([1,4,3,2],Float32Array.from({length:24},(_,i)=>3+Math.floor(i/6))),
  [2,4,2,2],[...Array(4).fill(9),...Array(4).fill(12),...Array(4).fill(15),...Array(4).fill(18),...Array(4).fill(18),...Array(4).fill(24),...Array(4).fill(30),...Array(4).fill(36)]]
];
for(const [a,b,shape,data] of cases){
 const graph=k.trace('matrix',({a,b})=>({out:N.matmul(a,b)}),{a:k.tensor(a.shape),b:k.tensor(b.shape)});
 const run=pipe.run(graph);assert.ok(run.ok,run.error?.message);
 for(const value of [graph.eval({a,b}).out,run.graph.eval({a,b}).out]){
  assert.deepEqual(value.shape,shape);assert.deepEqual(Array.from(value.data),data);
 }
}
for(const [x,w,shape,data] of [[seq([2,3]),seq([2,3]),[2,2],[14,32,32,77]],[seq([3]),seq([3]),[],[14]],[seq([2,3]),seq([3]),[2],[14,32]]]){
 const graph=k.trace('linear',({x,w})=>({out:N.linear(x,w)}),{x:k.tensor(x.shape),w:k.tensor(w.shape)});
 const run=pipe.run(graph);assert.ok(run.ok,run.error?.message);
 for(const value of [graph.eval({x,w}).out,run.graph.eval({x,w}).out]){assert.deepEqual(value.shape,shape);assert.deepEqual(Array.from(value.data),data);}
}
assert.throws(()=>matmulSpec([], [2,2]),/nonscalar/);
assert.throws(()=>matmulSpec([2,3],[4,2]),/contraction/);
assert.throws(()=>matmulSpec([2,2,3],[4,3,2]),/broadcast/);
assert.throws(()=>k.trace('mixed',({a,b})=>({out:N.matmul(a,b)}),{a:k.tensor([2,3],'f16'),b:k.tensor([3,2],'f16')}),/FP32/);
console.log('matrix/vector/broadcast reference, decomposition and validation passed');
