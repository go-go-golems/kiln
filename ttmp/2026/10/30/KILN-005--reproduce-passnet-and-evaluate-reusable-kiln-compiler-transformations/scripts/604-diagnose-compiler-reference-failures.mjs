import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.cwd(),ticket=resolve(import.meta.dirname,'..');
const load=async p=>import(pathToFileURL(resolve(root,p)).href);
const {params}=await load('packages/kiln/src/core/kiln.js');
const {std}=await load('packages/kiln/src/std/index.js');
const {compileScript,endToEnd}=await load('apps/workbench/src/compile.js');
const cases=[['parallel-port-task',177,6],['parallel-port-task',188,0],['parallel-port-task',110,4],['parallel-port-task',36,0],['parallel-port-task',31,2],['parallel-port-delta-task',47,0],['parallel-port-delta-task',195,0],['parallel-port-delta-task',146,2]];
const records=[];
for(const [cohort,task,index] of cases){
 const file=resolve(ticket,'sources',cohort+'-results-v1',`task-${String(task).padStart(3,'0')}`,'corpus',`${String(index).padStart(3,'0')}.kiln.js`);
 const row={cohort,task,index,file};
 try{
  const result=compileScript(readFileSync(file,'utf8'),{params:params([]),target:std.target(std.targets.a100),contraction:'separate'});
  row.compiled=result.ok;if(!result.ok)row.diagnostics=result.diags;
  else{
   const check=endToEnd(result.run,result.graph,result.project);
   row.e2e=check.e2e;
   if(check.outputs){row.values={};for(const [name,want] of Object.entries(check.outputs.want)){
    const got=check.outputs.got[name],mismatches=[];let maxAbs=0,maxRel=0;
    for(let i=0;i<want.data.length;i++){
     const a=want.data[i],b=got.data[i],delta=Math.abs(a-b),relative=delta/Math.max(Math.abs(a),1e-12);
     maxAbs=Math.max(maxAbs,delta);maxRel=Math.max(maxRel,relative);
     if(delta>1e-4+1e-3*Math.abs(a)&&mismatches.length<5)mismatches.push({index:i,reference:a,compiled:b,abs:delta});
    }
    row.values[name]={shape:want.shape,length:want.data.length,maxAbs,maxRel,mismatches};
   }}
  }
 }catch(e){row.error=String(e.stack||e)}
 records.push(row);console.log(task,index,row.e2e?.ok,row.e2e?.error||row.error||'');
 writeFileSync(resolve(ticket,'sources/compiler-reference-failure-diagnostic-v1.json'),JSON.stringify({format:'kiln-compiler-reference-diagnostic/1',scope:'Eight historical endToEnd failures replayed locally; no PassBench acceptance claim',records},null,2)+'\n');
}
