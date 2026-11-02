import assert from 'node:assert/strict';
import {k} from '../src/core/kiln.js';
import {Tensor,numel} from '../src/core/util.js';
import {N,decomposition} from '../src/std/tensor.js';
import {pipeline} from '../src/std/emmy.js';
import {SPECS,target} from '../src/std/targets.js';
import {analyze,legalMaps} from '../src/std/tile.js';
const pipe=k.pipeline('reshape-semantics').pass(decomposition).build();
// Generate unit-axis placements independently of the implementation's mapper.
const variants=base=>{
 const shapes=[];
 for(let bits=0;bits<2**(base.length+1);bits++){
  const shape=[];
  for(let i=0;i<=base.length;i++){if(bits&(1<<i))shape.push(1);if(i<base.length)shape.push(base[i]);}
  shapes.push(shape);
 }
 return shapes;
};
let cases=0;
for(const base of [[],[2],[2,3],[2,2]]){
 const shapes=variants(base);
 for(const input of shapes)for(const output of shapes)for(const dtype of ['f32','f16','bf16']){
  const graph=k.trace('unit-reshape',({x})=>({out:N.reshape(x,output)}),{x:k.tensor(input,dtype)});
  const run=pipe.run(graph);assert.ok(run.ok,run.error?.message);
  const x=new Tensor(input,Float32Array.from({length:numel(input)},(_,i)=>i-3));
  for(const result of [graph.eval({x}).out,run.graph.eval({x}).out]){
   assert.deepEqual(result.shape,output);assert.deepEqual(result.data,x.data);
  }
  assert.equal(run.graph.nodes.get(run.graph.outputs[0].id).type.dtype,dtype);cases++;
 }
}
// Singleton reshapes remain correct on a transposed logical input. General
// reshapes with changed non-unit dimensions still follow row-major order.
for(const output of [[1,3,2,1],[6],[2,3]]){
 const graph=k.trace('transpose-reshape',({x})=>({out:N.reshape(N.transpose(x,0,1),output)}),{x:k.tensor([2,3])});
 const run=pipe.run(graph);assert.ok(run.ok,run.error?.message);
 const x=new Tensor([2,3],Float32Array.of(0,1,2,3,4,5));
 assert.deepEqual(run.graph.eval({x}).out.data,Float32Array.of(0,3,1,4,2,5));
 assert.deepEqual(run.graph.eval({x}).out.shape,output);
}
// Real attention epilogue: transpose a unit batch axis and remove unit axes.
// The contraction classifier must see independent matrix coordinates afterwards.
const graph=k.trace('contraction-view',({a,b})=>{
 const product=N.matmul(a,b);
 return {out:N.reshape(N.reshape(N.transpose(product,1,2),[2,5,1,3]),[2,5,3])};
},{a:k.tensor([2,1,5,7]),b:k.tensor([2,1,7,3])});
const hardware=target(SPECS.a100),run=pipeline({target:hardware,contraction:'separate'}).run(graph);
assert.ok(run.ok,run.error?.message);
const loops=run.at('loop').findAll('loop.kernel');
assert.equal(loops.length,1);
const node=loops[0],analysis=analyze(node.attrs.expr,node.attrs.shape,node.args.map(a=>a.type.shape));
assert.ok(legalMaps(analysis).includes('tiled'),'viewed contraction must remain tileable');
assert.deepEqual([analysis.contraction.M,analysis.contraction.N,analysis.contraction.K],[5,3,7]);
const inputs={a:Tensor.random([2,1,5,7],{seed:4}),b:Tensor.random([2,1,7,3],{seed:9})};
const expected=graph.eval(inputs).out,actual=run.at('loop').eval(inputs).out;
assert.deepEqual(actual.shape,expected.shape);
for(let i=0;i<actual.data.length;i++)assert.ok(Math.abs(actual.data[i]-expected.data[i])<1e-5);
console.log(`${cases} scalar/unit-axis/dtype reshape cases, noncontiguous logical input, general reshape and tileable contraction passed`);
