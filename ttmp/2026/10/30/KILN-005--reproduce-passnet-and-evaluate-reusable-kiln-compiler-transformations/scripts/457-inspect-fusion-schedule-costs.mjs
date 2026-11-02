import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.cwd(),ticket=resolve(import.meta.dirname,'..');
const load=p=>import(pathToFileURL(resolve(root,p)).href);
const {runScript}=await load('packages/kiln/src/core/script.js');
const {std}=await load('packages/kiln/src/std/index.js');
const {analyze,forkTree,estimate}=await load('packages/kiln/src/std/tile.js');
const {prepareFusionPolicy}=await load('integrations/passnet/fusion_policy.mjs');
const policy=JSON.parse(readFileSync(resolve(ticket,'sources/pi-six-lane-study-v1/corpus/policies/glm-28.json')));
const prepared=prepareFusionPolicy(policy),target=std.target(std.targets.a100),results=[];
for(const index of [3,6,7,8,10,11])for(const variant of ['default','selective']) {
 const source=readFileSync(resolve(ticket,`sources/pi-six-lane-study-v1/corpus/${String(index).padStart(3,'0')}.kiln.js`),'utf8');
 const graph=runScript(source).project.graph();let pipe=std.emmy.pipeline({target,contraction:'separate'});
 if(variant==='selective')pipe=pipe.replaceRule('loop/fusion','merge_loop_ops',std.loop.createFusionRule({decide:prepared.decide,selectConsumers:prepared.selectConsumers}));
 const run=pipe.run(graph,{upTo:'loop'});if(!run.ok)throw new Error(run.error?.message);
 const kernels=[];
 for(const node of run.graph.findAll('loop.kernel')) {
  const an=analyze(node.attrs.expr,node.attrs.shape,node.args.map(a=>a.type.shape));
  const best={},tree=forkTree(an,target).leaf(()=>{}).meta.tree;
  function visit(i,kn) {
   if(i===tree.length) {
    const cost=estimate(an,kn,target);
    if(!best[kn.MAP]||cost.us<best[kn.MAP].cost.us)best[kn.MAP]={knobs:kn,cost};
    return;
   }
   const {p,valuesFn}=tree[i];for(const value of valuesFn(kn))visit(i+1,{...kn,[p.name]:value});
  }
  visit(0,{});
  const ct=an.contraction;
  kernels.push({shape:node.attrs.shape,contraction:ct?{M:ct.M,N:ct.N,K:ct.K,batch:ct.batch,A:ct.A.length,B:ct.B.length}:null,best});
 }
 results.push({index,variant,kernels});
}
writeFileSync(resolve(ticket,'sources/fusion-schedule-costs-v1.json'),JSON.stringify(results,null,2));
for(const row of results)console.log(row.index,row.variant,JSON.stringify(row.kernels.filter(k=>k.contraction).map(k=>({shape:k.shape,ct:k.contraction,costs:Object.fromEntries(Object.entries(k.best).map(([m,x])=>[m,x.cost.us]))}))));
