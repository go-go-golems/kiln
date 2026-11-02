import assert from 'node:assert/strict';
import {k} from '../src/core/kiln.js';
import {Tensor,compare} from '../src/core/util.js';
import {N,nn,tensor,decomposition} from '../src/std/tensor.js';
import {loop,lift,fuse,createFusionRule,workOf,schedule} from '../src/std/loop.js';

const lower=k.pipeline('lower').ir('torch',{dialects:[nn,tensor]}).pass(decomposition).pass(lift).ir('loop',{dialects:[loop,tensor]}).build();
const apply=(graph,options)=>k.pipeline('selective').ir('loop',{dialects:[loop,tensor]})
  .pass(k.pass('loop/fusion').rules(createFusionRule(options)).order('reverse'))
  .ir('result',{dialects:[loop,tensor]}).build().run(graph);
const graph=k.trace('fanout',({x,y,z})=>{const p=N.exp(x);return {a:N.add(p,y),b:N.mul(p,z)};},{x:k.tensor([32]),y:k.tensor([32]),z:k.tensor([32])});
const inputs=Object.fromEntries(['x','y','z'].map((name,i)=>[name,Tensor.random([32],{seed:42+i})])),original=lower.run(graph);
assert.ok(original.ok);
const producer=original.graph.findAll('loop.kernel').find(n=>n.users.length===2);
const [chosen,other]=producer.users.map(n=>n.id);
const candidates=[],decisions=[];
const partial=apply(original.graph,{maxWorkGrowth:2,selectConsumers:region=>{
  assert.ok(Object.isFrozen(region)&&Object.isFrozen(region.consumers));
  for(const edge of region.consumers){assert.ok(Object.isFrozen(edge));candidates.push(edge);}return [0];
},onDecision:event=>decisions.push(event)});
assert.ok(partial.ok,partial.error?.message);
assert.equal(candidates.length,2);
assert.equal(partial.graph.nodes.get(producer.id),original.graph.nodes.get(producer.id),'live producer preserved byte-for-byte');
assert.equal(partial.graph.nodes.get(other),original.graph.nodes.get(other),'unselected consumer preserved');
assert.ok(!partial.graph.nodes.get(chosen).args.includes(producer.id),'selected edge substituted');
assert.ok(partial.graph.nodes.get(other).args.includes(producer.id),'unselected edge retains materialization');
assert.deepEqual(partial.graph.outputs,original.graph.outputs);
for(const [name,want] of Object.entries(graph.eval(inputs)))assert.ok(compare(partial.graph.eval(inputs)[name],want,{rtol:1e-6,atol:1e-6}).ok);
const event=decisions[0],cost=g=>g.findAll('loop.kernel').reduce((sum,n)=>sum+workOf(schedule(n.attrs.expr,n.attrs.shape)),0);
assert.equal(event.selectedConsumerCount,1);assert.equal(event.retainedProducer,true);
assert.equal(event.originalWork,cost(original.graph));assert.equal(event.fusedWork,cost(partial.graph),'retained producer counted in aggregate work');

// Select-all is exactly the existing transformation, including output identities.
const defaultRun=apply(original.graph,{}),all=apply(original.graph,{selectConsumers:r=>r.consumers.map((_,i)=>i)});
assert.ok(defaultRun.ok&&all.ok);assert.equal(defaultRun.graph.key(),all.graph.key());
const fixtureDefault=k.pipeline('default').ir('torch',{dialects:[nn,tensor]}).pass(decomposition).pass(lift).pass(fuse).ir('loop',{dialects:[loop,tensor]}).build().run(graph);
assert.equal(defaultRun.graph.key(),fixtureDefault.graph.key());
assert.equal(defaultRun.graph.nodes.has(producer.id),false,'dead producer removed when all consumers inline');

// Empty selection is a skip; a failed aggregate guard restores every changed node.
const none=apply(original.graph,{selectConsumers:()=>[]});
assert.ok(none.ok);assert.equal(none.graph.key(),original.graph.key());
assert.equal(none.steps.filter(s=>s.kind==='rewrite').length,0);
const rejected=[];
const rollback=apply(original.graph,{maxWorkGrowth:1.02,selectConsumers:()=>[0],onDecision:e=>rejected.push(e)});
assert.ok(rollback.ok);assert.equal(rollback.graph.key(),original.graph.key());
assert.equal(rollback.graph.nodes.get(chosen),original.graph.nodes.get(chosen));assert.equal(rejected[0].accepted,false);
assert.ok(rejected[0].fusedWork>1.02*rejected[0].originalWork);
assert.ok(rejected[0].fusedWork-workOf(schedule(producer.attrs.expr,producer.attrs.shape))<=1.02*rejected[0].originalWork,
  'omitting the retained producer would incorrectly accept this mutation');

// Repeated producer operands and nested reductions must use shared inlining's
// input remapping/fresh reduction binders, independently of retained lifetimes.
const nested=k.trace('nested',({x})=>{const p=N.sum(N.mul(x,x),-1);return {a:N.sum(N.add(p,p),0),b:N.mul(p,2)};},{x:k.tensor([4,8])});
const nestedInput={x:Tensor.random([4,8],{seed:13})};
const lowered=lower.run(nested);
const nestedRun=apply(lowered.graph,{maxWorkGrowth:2,selectConsumers:r=>r.consumers.length>1?[0]:[]});
assert.ok(nestedRun.ok,nestedRun.error?.message);
for(const [name,want] of Object.entries(nested.eval(nestedInput)))assert.ok(compare(nestedRun.graph.eval(nestedInput)[name],want,{rtol:1e-6,atol:1e-6}).ok);

assert.throws(()=>createFusionRule({selectConsumer:()=>true}),/Unknown fusion rule option/);
assert.throws(()=>createFusionRule({selectConsumers:1}),/selector must be a function/);
for(const selection of [true,[0,0],[-1],[2],[.5]]){
 const invalid=apply(original.graph,{selectConsumers:()=>selection});
 assert.equal(invalid.ok,false);assert.match(invalid.error.message,/distinct valid consumer indices/);
}
console.log('selective fusion retains live producers, counts total work, rolls back rejection and preserves shared inlining semantics');
