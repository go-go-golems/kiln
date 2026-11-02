// Focused CPU reference diagnostic; no compiler/check modifications.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const [root,file]=process.argv.slice(2);
const {compileScript,endToEnd}=await import(resolve(root,'apps/workbench/src/compile.js'));
const {params}=await import(resolve(root,'packages/kiln/src/core/kiln.js'));
const {std}=await import(resolve(root,'packages/kiln/src/std/index.js'));
const c=compileScript(readFileSync(file,'utf8'),{params:params([]),target:std.target(std.targets.a100),pins:{}});
if(!c.ok)throw new Error(JSON.stringify(c.diags));
const result=endToEnd(c.run,c.graph,c.project);
console.log(JSON.stringify(result.e2e));
if(result.outputs){
 for(const [name,want] of Object.entries(result.outputs.want)){
  const got=result.outputs.got[name];let nonfinite=0,unequal=0,maxAbs=0;const worst=[];
  for(let i=0;i<want.data.length;i++){
   const a=got.data[i],b=want.data[i],difference=Math.abs(a-b);
   if(!Number.isFinite(a)||!Number.isFinite(b))nonfinite++;
   if(a!==b){unequal++;maxAbs=Math.max(maxAbs,difference);worst.push({index:i,got:a,want:b,abs:difference});worst.sort((x,y)=>y.abs-x.abs);if(worst.length>8)worst.pop();}
  }
  console.log(JSON.stringify({name,shape:want.shape,nonfinite,unequal,maxAbs,worst}));
 }
}
