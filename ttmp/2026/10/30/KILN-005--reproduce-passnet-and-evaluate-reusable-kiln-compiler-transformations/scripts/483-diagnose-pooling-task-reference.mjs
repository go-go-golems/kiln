import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const T=resolve(import.meta.dirname,'..'),load=p=>import(pathToFileURL(resolve(p)).href);
const {runScript}=await load('packages/kiln/src/core/script.js');
const {std}=await load('packages/kiln/src/std/index.js');
const {endToEnd}=await load('apps/workbench/src/compile.js');
const source=readFileSync(resolve(T,'sources/avg-pooling-import-v1/011.kiln.js'),'utf8');
const project=runScript(source).project,graph=project.graph(),target=std.target(std.targets.a100);
const run=std.emmy.pipeline({target,contraction:'separate'}).run(graph);
if(!run.ok)throw new Error(run.error?.message);
const result=endToEnd(run,graph,project);
const rows=[];
for(const name of Object.keys(result.outputs.want)){
 const a=result.outputs.got[name].data,b=result.outputs.want[name].data;
 let differences=0,maxAbs=0,first=[];
 for(let i=0;i<a.length;i++)if(a[i]!==b[i]){differences++;maxAbs=Math.max(maxAbs,Math.abs(a[i]-b[i]));if(first.length<8)first.push({index:i,loop:a[i],frontend:b[i]});}
 rows.push({output:name,length:a.length,differences,max_abs_error:maxAbs,first});
}
const evidence={source:'avg-pooling-import-v1/011.kiln.js',e2e:result.e2e,outputs:rows,scope:'Compiler frontend versus lowered loop reference; not CUDA or original evaluator.'};
writeFileSync(resolve(T,'sources/avg-pooling-task-reference-diagnostic-v1.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
