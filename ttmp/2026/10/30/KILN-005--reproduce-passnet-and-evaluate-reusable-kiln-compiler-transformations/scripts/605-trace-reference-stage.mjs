import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.cwd(),ticket=resolve(import.meta.dirname,'..'),load=async p=>import(pathToFileURL(resolve(root,p)).href);
const {params}=await load('packages/kiln/src/core/kiln.js');const {std}=await load('packages/kiln/src/std/index.js');const {compileScript}=await load('apps/workbench/src/compile.js');
const file=resolve(ticket,'sources/parallel-port-delta-task-results-v1/task-195/corpus/000.kiln.js');
const c=compileScript(readFileSync(file,'utf8'),{params:params([]),target:std.target(std.targets.a100),contraction:'separate'});if(!c.ok)throw new Error(JSON.stringify(c.diags));
const inputs=c.project.inputsFor(c.graph),want=c.graph.eval(inputs),rows=[];
for(const [name,g] of [['frontend',c.graph],...c.run.irOrder.map(name=>[name,c.run.at(name)])]){
 if(!g)continue;
 try{
  const result=g.eval(inputs),checks={};for(const key of Object.keys(want)){
   let count=0,maxAbs=0,first=null;for(let i=0;i<want[key].data.length;i++){
    const a=want[key].data[i],b=result[key].data[i],d=Math.abs(a-b);if(d>0){count++;maxAbs=Math.max(maxAbs,d);if(!first)first={index:i,reference:a,actual:b};}
   }checks[key]={count,maxAbs,first};
  }rows.push({stage:name,checks});
 }catch(e){rows.push({stage:name,error:String(e.message)})}
}
const out={format:'kiln-stage-numerical-diagnostic/1',scope:'Task195 fixed random reference inputs, frontend versus each evaluable IR stage',rows};
writeFileSync(resolve(ticket,'sources/compiler-stage-numerical-diagnostic-v1.json'),JSON.stringify(out,null,2)+'\n');console.log(rows);
