// Inspect the actual failing end-to-end checks; no tolerance or source changes.
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const ticket=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const root=resolve(ticket,'../../../../..');
const {compileScript,endToEnd}=await import(resolve(root,'apps/workbench/src/compile.js'));
const {params}=await import(resolve(root,'packages/kiln/src/core/kiln.js'));
const {target,SPECS}=await import(resolve(root,'packages/kiln/src/std/targets.js'));
const rows=[];
for(const index of [168,186]){
 const script=resolve(ticket,`sources/gelu-source-cohort-v1/task-${index}/corpus/000.kiln.js`);
 const compiled=compileScript(readFileSync(script,'utf8'),{params:params([]),target:target(SPECS.a100),contraction:'separate'});
 const result={index,compile_ok:compiled.ok,diags:compiled.diags};
 if(compiled.ok){
  const check=endToEnd(compiled.run,compiled.graph,compiled.project);result.e2e=check.e2e;
  if(check.outputs){
   result.failures={};
   for(const name of Object.keys(check.outputs.want)){
    const wanted=check.outputs.want[name],actual=check.outputs.got[name];let mismatches=0;const examples=[];
    for(let i=0;i<wanted.data.length;i++){
     const want=wanted.data[i],got=actual.data[i],error=Math.abs(want-got);
     if(error>1e-4+1e-3*Math.abs(want)){
      mismatches++;if(examples.length<8)examples.push({index:i,want,got,error});
     }
    }
    result.failures[name]={shape:wanted.shape,mismatches,examples};
   }
  }
 }
 rows.push(result);console.log(JSON.stringify(result,null,2));
}
writeFileSync(resolve(ticket,'sources/gelu-compile-check-diagnostic-v1.json'),JSON.stringify(rows,null,2)+'\n');
