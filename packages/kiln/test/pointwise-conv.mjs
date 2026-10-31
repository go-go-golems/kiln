import assert from 'node:assert/strict';
import {k} from '../src/core/kiln.js';
import {Tensor} from '../src/core/util.js';
import {N,decomposition,decompose} from '../src/std/tensor.js';
import {lowerPointwiseConv2d} from '../src/std/conv2d.js';
const base=k.pipeline('pointwise-test').pass(decomposition).build();
const pipe=base.replaceRule('frontend/decomposition','decompose:nn.conv2d',decompose('nn.conv2d',({T,x,w,b,...options})=>lowerPointwiseConv2d(T,x,w,b,options)));
let checked=0;
for(const groups of [1,2,4])for(const stride of [1,[2,3]])for(const padding of [0,1])for(const dtype of ['f32','f16','bf16']){
 const c=8,oc=12,n=2,h=5,width=7;
 const shape=[n,c,h,width],ws=[oc,c/groups,1,1];
 const graph=k.trace('pointwise',({x,w,b})=>({out:N.conv2d(x,w,b,{groups,stride,padding})}),{x:k.tensor(shape,dtype),w:k.tensor(ws,dtype),b:k.tensor([oc],dtype)});
 const values={};
 for(const [name,ss] of [['x',shape],['w',ws],['b',[oc]]]){
  const tensor=new Tensor(ss);for(let i=0;i<tensor.data.length;i++)tensor.data[i]=((i*7)%13-6)/8;values[name]=tensor;
 }
 const run=pipe.run(graph);assert.ok(run.ok,run.error?.message);
 const got=run.graph.eval(values).out,want=graph.eval(values).out;
 assert.deepEqual(got.shape,want.shape);assert.deepEqual(Array.from(got.data),Array.from(want.data));checked++;
}
// A non-pointwise convolution takes the unchanged generic decomposition.
const graph=k.trace('fallback',({x,w,b})=>({out:N.conv2d(x,w,b)}),{x:k.tensor([1,2,5,5]),w:k.tensor([3,2,3,3]),b:k.tensor([3])});
const values={x:new Tensor([1,2,5,5]),w:new Tensor([3,2,3,3]),b:new Tensor([3])};
values.x.data.fill(2);values.w.data.fill(0.5);values.b.data.fill(1);
assert.deepEqual(Array.from(pipe.run(graph).graph.eval(values).out.data),Array.from(graph.eval(values).out.data));
console.log(`${checked} grouped/strided/padded typed pointwise cases and non-pointwise fallback passed.`);
