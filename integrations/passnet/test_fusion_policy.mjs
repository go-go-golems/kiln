import assert from 'node:assert/strict';
import {prepareFusionPolicy} from './fusion_policy.mjs';
const policy={format:'kiln-fusion-policy/1',id:'small-single',kind:'decision-tree',tree:{
 if:{feature:'producerElements',op:'le',value:512},
 then:{if:{feature:'consumerCount',op:'eq',value:1},then:{threshold:1.08},else:{threshold:1.02}},
 else:{threshold:1.02}}};
const prepared=prepareFusionPolicy(policy);
const features={originalWork:100,fusedWork:107,consumerCount:1,producerElements:128};
assert.equal(prepared.decide(features),true);
assert.equal(typeof prepared.decide({...features,consumerCount:2}),'string');
assert.equal(typeof prepared.decide({...features,producerElements:1024}),'string');
assert.equal(typeof prepared.decide({...features,fusedWork:109}),'string');
assert.equal(prepared.nodeCount,5);
// Editing the input JSON after validation cannot alter the compiled decision.
policy.tree.then.then.threshold=2;
assert.equal(typeof prepared.decide({...features,fusedWork:109}),'string');
for(const mutation of [
 {if:{feature:'process.env',op:'le',value:1},then:{accept:true},else:{accept:false}},
 {threshold:Infinity},{threshold:3},{accept:'yes'},
 {if:{feature:'producerElements',op:'exec',value:1},then:{accept:true},else:{accept:false}},
])assert.throws(()=>prepareFusionPolicy({...policy,tree:mutation}),/Invalid|Threshold/);
assert.throws(()=>prepareFusionPolicy(policy,{maxNodes:2}),/budget/);
assert.throws(()=>prepareFusionPolicy(policy,{maxDepth:1}),/budget/);
assert.throws(()=>prepared.decide({...features,originalWork:NaN}),/feature/);
assert.equal(prepareFusionPolicy({format:'kiln-fusion-policy/1',id:'base',kind:'unchanged'}).apply,false);


const capped=prepareFusionPolicy({format:'kiln-fusion-policy/1',id:'accept',kind:'decision-tree',tree:{accept:true}});
assert.equal(typeof capped.decide({...features,fusedWork:201}),'string');

const mutableBoolean={format:'kiln-fusion-policy/1',id:'boolean',kind:'decision-tree',tree:{accept:true}};
const frozenBoolean=prepareFusionPolicy(mutableBoolean);mutableBoolean.tree.accept=false;
assert.equal(frozenBoolean.decide(features),true,'validated Boolean leaf must not retain a mutable JSON reference');
assert.throws(()=>prepareFusionPolicy(policy,{maxNodes:Infinity}),/budget/);

console.log('bounded feature programs, compiler-feature isolation and immutable compilation passed');

// Exercise the interpreted program through the real compiler's rule interface.
const {k}=await import('../../packages/kiln/src/core/kiln.js');
const {Tensor,compare}=await import('../../packages/kiln/src/core/util.js');
const {N,nn,tensor,decomposition}=await import('../../packages/kiln/src/std/tensor.js');
const {loop,lift,fuse,createFusionRule}=await import('../../packages/kiln/src/std/loop.js');
const base=k.pipeline('program-test').ir('torch',{dialects:[nn,tensor]}).pass(decomposition).pass(lift).pass(fuse).ir('loop',{dialects:[loop,tensor]}).build();
const graph=k.trace('fanout',({x})=>{const value=N.exp(x);return {a:N.add(value,1),b:N.mul(value,2)};},{x:k.tensor([32])});
const interpreted=prepareFusionPolicy({format:'kiln-fusion-policy/1',id:'conditional',kind:'decision-tree',tree:{if:{feature:'producerElements',op:'le',value:64},then:{accept:false},else:{threshold:1.02}}});
const variant=base.replaceRule('loop/fusion','merge_loop_ops',createFusionRule({decide:interpreted.decide}));
const normal=base.run(graph),changed=variant.run(graph);assert.ok(normal.ok&&changed.ok);
assert.ok(changed.graph.findAll('loop.kernel').length>normal.graph.findAll('loop.kernel').length);
const inputs={x:Tensor.random([32],{seed:42})};
for(const [name,want] of Object.entries(graph.eval(inputs)))assert.ok(compare(changed.graph.eval(inputs)[name],want,{rtol:1e-6,atol:1e-6}).ok);
console.log('feature program changes actual compiler decisions and preserves values');

// A separate consumer tree selects edges; the aggregate tree still caps total
// work including any retained producer. Consumer order/IDs are not DSL features.
const selectivePolicy={format:'kiln-fusion-policy/1',id:'select-reduction',kind:'selective',
 tree:{threshold:2},consumer_tree:{if:{feature:'consumerElements',op:'le',value:1},then:{accept:true},else:{accept:false}}};
const selective=prepareFusionPolicy(selectivePolicy);
assert.equal(selective.nodeCount,4);
const edge={producerWork:100,consumerWork:30,fusedConsumerWork:40,consumerCount:2,producerElements:32,consumerElements:1};
assert.deepEqual(selective.selectConsumers({consumers:[edge]}),[0]);
assert.deepEqual(selective.selectConsumers({consumers:[{...edge,consumerElements:32}]}),[]);
selectivePolicy.consumer_tree.then.accept=false;
assert.deepEqual(selective.selectConsumers({consumers:[edge]}),[0],'compiled selection must not retain mutable JSON');
assert.throws(()=>selective.selectConsumers({consumers:[{...edge,consumerWork:NaN}]}),/consumer feature/);
assert.throws(()=>prepareFusionPolicy({...selectivePolicy,consumer_tree:{if:{feature:'consumerIndex',op:'eq',value:0},then:{accept:true},else:{accept:false}}}),/predicate/);
assert.throws(()=>prepareFusionPolicy({...selectivePolicy,kind:'decision-tree'}),/Only selective/);
assert.throws(()=>prepareFusionPolicy(selectivePolicy,{maxNodes:3}),/budget/);
const reducedGraph=k.trace('selective-reduction',({x,y})=>{const p=N.exp(x);return {a:N.sum(p,-1),b:N.mul(p,y)};},{x:k.tensor([32]),y:k.tensor([32])});
const selectedRun=base.replaceRule('loop/fusion','merge_loop_ops',createFusionRule({decide:selective.decide,selectConsumers:selective.selectConsumers})).run(reducedGraph);
assert.ok(selectedRun.ok,selectedRun.error?.message);
assert.ok(selectedRun.graph.findAll('loop.kernel').some(p=>p.users.length===1&&!selectedRun.graph.isOutput(p.id)),
 'unselected consumer keeps the producer alive');
const reducedInputs={x:Tensor.random([32],{seed:17}),y:Tensor.random([32],{seed:18})};
for(const [name,want] of Object.entries(reducedGraph.eval(reducedInputs)))assert.ok(compare(selectedRun.graph.eval(reducedInputs)[name],want,{rtol:1e-6,atol:1e-6}).ok);
console.log('bounded selective programs change actual consumer edges with retained-producer correctness');

const regionPolicy={format:'kiln-fusion-policy/1',id:'region-cost',kind:'region',max_work_growth:1.02,launch_work:0,materialization_work:0};
const planned=prepareFusionPolicy(regionPolicy);
const joint={producerWork:10,producerElements:64,consumers:[0,1].map(()=>({consumerWork:10,fusedConsumerWork:14,consumerElements:32}))};
assert.deepEqual(planned.selectConsumers(joint),[0,1]);assert.equal(planned.nodeCount,1);
regionPolicy.launch_work=1048577;regionPolicy.max_work_growth=0;
assert.deepEqual(planned.selectConsumers(joint),[0,1],'validated cost parameters are immutable');
assert.throws(()=>prepareFusionPolicy(regionPolicy),/bounded region weights/);
assert.throws(()=>prepareFusionPolicy({...regionPolicy,kind:'threshold'}),/Only region/);
assert.throws(()=>prepareFusionPolicy({...regionPolicy,launch_work:0,materialization_work:Infinity}),/bounded region weights/);
const regionRun=base.replaceRule('loop/fusion','merge_loop_ops',createFusionRule({decide:planned.decide,selectConsumers:planned.selectConsumers})).run(reducedGraph);
assert.ok(regionRun.ok,regionRun.error?.message);
for(const [name,want] of Object.entries(reducedGraph.eval(reducedInputs)))assert.ok(compare(regionRun.graph.eval(reducedInputs)[name],want,{rtol:1e-6,atol:1e-6}).ok);
console.log('bounded whole-region programs jointly select producer removal through the real compiler');
