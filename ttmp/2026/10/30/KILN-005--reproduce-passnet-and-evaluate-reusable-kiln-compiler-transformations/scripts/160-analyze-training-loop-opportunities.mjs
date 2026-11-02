// Structural analysis only: prior development training, no new timing or held-out reads.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
const [root,corpus,output]=process.argv.slice(2);
const {runScript}=await import(resolve(root,'packages/kiln/src/core/script.js'));
const {std}=await import(resolve(root,'packages/kiln/src/std/index.js'));
const manifest=JSON.parse(readFileSync(join(corpus,'manifest.json'),'utf8'));
const rows=[];
function opportunities(graph){
 const groups=new Map();let multiConsumer=0,reductions=0,kernels=0;
 for(const node of graph.nodes.values()){
  if(node.name!=='loop.kernel')continue;kernels++;
  if(graph.users(node.id).length>1)multiConsumer++;
  if(std.loop.schedule(node.attrs.expr,node.attrs.shape).reds.length)reductions++;
  if(graph.isOutput(node.id)||node.knobs)continue;
  const key=JSON.stringify([node.attrs.expr.__key,node.args,node.type]);
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push(node.id);
 }
 const duplicateGroups=[...groups.values()].filter(ids=>ids.length>1);
 return {kernels,multiConsumer,reductions,internalDuplicateGroups:duplicateGroups,removableExactDuplicates:duplicateGroups.reduce((n,ids)=>n+ids.length-1,0)};
}
for(const record of manifest.variants){
 if(record.split!=='train')continue;
 const parsed=runScript(readFileSync(join(corpus,record.script),'utf8'));
 if(!parsed.ok)throw new Error(JSON.stringify(parsed.diags));
 const graph=parsed.project.graph();const row={graph:record.graph};
 for(const mode of ['default','unfused']){
  let pipe=std.emmy.pipeline({target:std.target(std.targets.a100),contraction:'separate'});
  if(mode==='unfused')pipe=pipe.without('loop/fusion');
  const run=pipe.run(graph);if(!run.ok)throw new Error(run.error?.message);
  row[mode]=opportunities(run.at('loop'));
 }
 rows.push(row);console.log(record.script,JSON.stringify(row.default),JSON.stringify(row.unfused));
}
writeFileSync(output,JSON.stringify({scope:'Structural prior-training analysis only; no new timing, no confirmation reads; exact kernel input IDs and expressions; graph outputs excluded from candidate CSE',membership_sha256:manifest.membership_sha256,contraction:'separate',records:rows},null,2)+'\n');
