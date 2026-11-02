import assert from 'node:assert/strict';
import {k} from '../src/core/kiln.js';
import {Tensor,compare} from '../src/core/util.js';
import {N,nn,tensor,decomposition} from '../src/std/tensor.js';
import {loop,lift,fuse,createFusionRule,mergeLoopOps} from '../src/std/loop.js';
const base=k.pipeline('policy').ir('torch',{dialects:[nn,tensor]}).pass(decomposition).pass(lift).pass(fuse).ir('loop',{dialects:[loop,tensor]}).build();
const graph=k.trace('fanout',({x})=>{const p=N.exp(x);return {a:N.add(p,1),b:N.mul(p,2)};},{x:k.tensor([32])});
const input={x:Tensor.random([32],{seed:42})};
const counts=[];
for(const rule of [mergeLoopOps,createFusionRule(),createFusionRule({maxWorkGrowth:0})]) {
 const run=base.replaceRule('loop/fusion','merge_loop_ops',rule).run(graph);
 assert.ok(run.ok,run.error?.message);
 for(const [name,want] of Object.entries(graph.eval(input)))assert.ok(compare(run.graph.eval(input)[name],want,{rtol:1e-6,atol:1e-6}).ok);
 counts.push(run.graph.findAll('loop.kernel').length);
}
assert.equal(counts[0],counts[1],'factory default preserves existing decision');
assert.ok(counts[2]>counts[0],`strict guard changes a fanout schedule: ${counts}`);
const observations=[];
const run=base.replaceRule('loop/fusion','merge_loop_ops',createFusionRule({decide:features=>{
 assert.ok(Object.isFrozen(features));return false;
},onDecision:event=>observations.push(event)})).run(graph);
assert.ok(run.ok);assert.ok(observations.length);assert.ok(observations.every(e=>!e.accepted));
assert.throws(()=>createFusionRule({maxWorkGrowth:Infinity}),/finite/);
console.log('fusion policy defaults, fanout behavior, correctness and immutable diagnostics passed',counts);
