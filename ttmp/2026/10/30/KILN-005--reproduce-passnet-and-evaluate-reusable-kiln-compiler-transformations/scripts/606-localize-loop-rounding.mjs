import {readFileSync,writeFileSync} from 'node:fs';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
const root=process.cwd(),ticket=resolve(import.meta.dirname,'..'),load=async p=>import(pathToFileURL(resolve(root,p)).href);
const {params}=await load('packages/kiln/src/core/kiln.js');const {std}=await load('packages/kiln/src/std/index.js');const {compileScript}=await load('apps/workbench/src/compile.js');
const file=resolve(ticket,'sources/parallel-port-delta-task-results-v1/task-195/corpus/000.kiln.js');let text=readFileSync(file,'utf8');
text=text.replace('return {out0: v3, out1: v13};','return {'+Array.from({length:11},(_,i)=>`v${i+3}: v${i+3}`).join(', ')+'};');
const c=compileScript(text,{params:params([]),target:std.target(std.targets.a100),contraction:'separate'});if(!c.ok)throw new Error(JSON.stringify(c.diags));
const inputs=c.project.inputsFor(c.graph),want=c.graph.eval(inputs),got=c.run.at('loop').eval(inputs),rows=[];
for(const key of Object.keys(want)){
 let mismatch=0,maxAbs=0,first=null;for(let i=0;i<want[key].data.length;i++){const a=want[key].data[i],b=got[key].data[i],d=Math.abs(a-b);if(d>0){mismatch++;maxAbs=Math.max(maxAbs,d);if(!first)first={index:i,a,b};}}
 rows.push({key,shape:want[key].shape,mismatch,maxAbs,first});
}
writeFileSync(resolve(ticket,'sources/loop-rounding-localization-v1.json'),JSON.stringify({format:'kiln-loop-rounding-localization/1',scope:'Task195 frontend versus loop, intermediates exposed as outputs; altered output graph for diagnosis',rows},null,2)+'\n');console.log(rows);
