import assert from 'node:assert/strict';
import {chooseFusionSubset} from '../src/std/fusion.js';
const region=(producerWork,consumers)=>({producerWork,producerElements:64,
 consumers:consumers.map(([consumerWork,fusedConsumerWork])=>({consumerWork,fusedConsumerWork,consumerElements:32}))});
// Both edges grow, yet their joint producer elimination is profitable.
assert.deepEqual(chooseFusionSubset(region(10,[[10,14],[10,14]])),[0,1]);
assert.deepEqual(chooseFusionSubset(region(1,[[10,8],[10,100]])),[0]);
assert.deepEqual(chooseFusionSubset(region(1,[[10,8],[10,20]]),{launchWork:20,maxWorkGrowth:2}),[0,1]);
assert.deepEqual(chooseFusionSubset(region(1,[[10,8],[10,20]]),{launchWork:20,maxWorkGrowth:1.02}),[0]);
assert.deepEqual(chooseFusionSubset(region(0,[[10,10]])),[],'keep the original on exact ties');
assert.deepEqual(chooseFusionSubset(region(0,[[10,10]]),{launchWork:1}),[0]);
assert.deepEqual(chooseFusionSubset(region(1,[[10,8],[10,20]]),{materializationWork:1,maxWorkGrowth:2}),[0,1]);
assert.ok(Object.isFrozen(chooseFusionSubset(region(10,[[10,14],[10,14]]))));

// Compare with an independent exhaustive search over every subset, rather than
// duplicating the linear planner. Materialized values and launches are counted
// explicitly for each candidate graph.
let state=12345;
const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;};
let comparisons=0;
for(let m=1;m<=7;m++)for(let trial=0;trial<40;trial++){
 const r=region(random()%100,Array.from({length:m},()=>[random()%100,random()%150]));
 const options={launchWork:[0,13,100][trial%3],materializationWork:[0,.5,12][trial%3],maxWorkGrowth:[0,.8,1.02,2][trial%4]};
 const originalWork=r.producerWork+r.consumers.reduce((s,e)=>s+e.consumerWork,0);
 const score=mask=>{
  const full=mask===(1<<m)-1;
  let work=full?0:r.producerWork,values=full?0:r.producerElements,kernels=full?0:1;
  for(let i=0;i<m;i++){const e=r.consumers[i];work+=(mask&(1<<i))?e.fusedConsumerWork:e.consumerWork;values+=e.consumerElements;kernels++;}
  return mask!==0&&work>originalWork*options.maxWorkGrowth?Infinity:work+options.launchWork*kernels+options.materializationWork*values;
 };
 const chosen=chooseFusionSubset(r,options),mask=chosen.reduce((bits,i)=>bits|(1<<i),0);
 const best=Math.min(...Array.from({length:1<<m},(_,bits)=>score(bits)));
 assert.equal(score(mask),best,`nonoptimal local plan m=${m} trial=${trial}`);comparisons++;
}
assert.throws(()=>chooseFusionSubset(region(1,[[2,3]]),{launchWork:-1}),/finite/);
assert.throws(()=>chooseFusionSubset(region(1,[[2,3]]),{unknown:1}),/options/);
assert.throws(()=>chooseFusionSubset(region(1,[[Infinity,3]])),/costs/);
assert.throws(()=>chooseFusionSubset(region(Number.MAX_VALUE,[[Number.MAX_VALUE,3]])),/overflow/);
console.log('whole-region planner matches exhaustive subset search',comparisons,'cases; joint removal, bounds and ties passed');
