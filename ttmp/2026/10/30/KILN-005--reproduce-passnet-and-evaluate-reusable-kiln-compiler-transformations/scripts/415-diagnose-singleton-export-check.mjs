// Preserve actual frontend/IR discrepancies without changing checks or source.
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const ticket=resolve(dirname(fileURLToPath(import.meta.url)),'..'),root=resolve(ticket,'../../../../..');
const {compileScript,endToEnd}=await import(resolve(root,'apps/workbench/src/compile.js'));
const {params}=await import(resolve(root,'packages/kiln/src/core/kiln.js'));
const {target,SPECS}=await import(resolve(root,'packages/kiln/src/std/targets.js'));
const source=resolve(ticket,'sources/singleton-view-source-cohort-v1/task-010/corpus/001.kiln.js');
const compiled=compileScript(readFileSync(source,'utf8'),{params:params([]),target:target(SPECS.a100),contraction:'separate'});
if(!compiled.ok)throw new Error(JSON.stringify(compiled.diags));
const check=endToEnd(compiled.run,compiled.graph,compiled.project),records=[];
const inputs=check.outputs?.inputs || compiled.project.inputsFor(compiled.graph);
function summary(name,wanted,actual){
 let different=0,failed=0,maxAbs=0;const examples=[];
 for(let i=0;i<wanted.data.length;i++){
  const want=wanted.data[i],got=actual.data[i],error=Math.abs(want-got);
  if(want!==got)different++;if(error>maxAbs)maxAbs=error;
  if(error>1e-4+1e-3*Math.abs(want)){failed++;if(examples.length<12)examples.push({index:i,want,got,error});}
 }
 return {name,shape:wanted.shape,different,failed,max_abs_error:maxAbs,examples};
}
for(const [name,want] of Object.entries(check.outputs.want))records.push(summary(name,want,check.outputs.got[name]));
const refs=new Map();compiled.graph.eval(inputs,{values:refs});
const stages=[];
for(const ir of compiled.run.irOrder){
 const graph=compiled.run.at(ir);if(!graph)continue;
 try{const actual=graph.eval(inputs);stages.push({ir,outputs:Object.entries(check.outputs.want).map(([name,want])=>summary(name,want,actual[name]))});}
 catch(error){stages.push({ir,error:error.message});}
}
const result={format:'kiln-singleton-export-diagnostic/1',source,e2e:check.e2e,outputs:records,stages,
 frontend_nodes:[...compiled.graph.nodes.values()].map(n=>({id:n.id,operation:n.name,type:n.type,args:n.args}))};
writeFileSync(resolve(ticket,'sources/singleton-export-check-diagnostic-v1.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
