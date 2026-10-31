import {k} from "../../../../../../packages/kiln/src/core/kiln.js";
import {N,nn,tensor,decomposition} from "../../../../../../packages/kiln/src/std/tensor.js";
import {loop,lift,createFusionRule} from "../../../../../../packages/kiln/src/std/loop.js";
const graph=k.trace("fanout",({x})=>{const p=N.exp(x);return {a:N.add(p,1),b:N.mul(p,2)};},{x:k.tensor([32])});
const initial=k.pipeline("lower").ir("torch",{dialects:[nn,tensor]}).pass(decomposition).pass(lift).ir("loop",{dialects:[loop,tensor]}).build().run(graph);
console.log(initial.graph.print());
const run=k.pipeline("partial").ir("loop",{dialects:[loop,tensor]}).pass(k.pass("loop/fusion").rules(createFusionRule({maxWorkGrowth:2,selectConsumer:f=>{console.log("CANDIDATE",f);return f.consumerIndex===0;},onDecision:e=>console.log("DECISION",e)})).order("reverse")).ir("result",{dialects:[loop,tensor]}).build().run(initial.graph);
console.log(run.ok,run.error,run.graph.print());
console.log(run.steps.map(s=>({kind:s.kind,node:s.node,reason:s.reason,changed:s.changed})));
