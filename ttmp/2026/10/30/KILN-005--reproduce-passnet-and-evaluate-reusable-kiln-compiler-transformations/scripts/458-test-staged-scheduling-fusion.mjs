import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const root=process.cwd(),ticket=resolve(import.meta.dirname,'..');
const load=path=>import(pathToFileURL(resolve(root,path)).href);
const {runScript}=await load('packages/kiln/src/core/script.js');
const {std}=await load('packages/kiln/src/std/index.js');
const {applySchedulingFusion}=await load('integrations/passnet/scheduling_fusion.mjs');
const {exportProgram}=await load('packages/kiln/src/std/export.js');
const {endToEnd}=await load('apps/workbench/src/compile.js');
const output=resolve(ticket,'sources/scheduling-fusion-probe-v1');mkdirSync(output);
const results=[];
for(const index of [3,6,7,8,10,11]) {
 const file=String(index).padStart(3,'0')+'.kiln.js';
 const source=readFileSync(resolve(ticket,'sources/pi-six-lane-study-v1/corpus',file),'utf8');
 const project=runScript(source).project,graph=project.graph(),target=std.target(std.targets.a100);
 for(const variant of ['default','preserve']) {
  let pipe=std.emmy.pipeline({target,contraction:'separate'});
  if(variant==='preserve')pipe=applySchedulingFusion(pipe,target);
  const run=pipe.run(graph);if(!run.ok)throw new Error(run.error?.message);
  const check=endToEnd(run,graph,project).e2e;if(check.error||(!check.skipped&&!check.ok))throw new Error(JSON.stringify(check));
  const artifact=exportProgram(run,std.gpu.programOf(run.graph),{name:'probe',target});
  writeFileSync(resolve(output,`${index}-${variant}.json`),JSON.stringify(artifact,null,2));
  results.push({index,variant,reference:check,kernels:artifact.kernels.map(k=>({shape:k.shape,row:k.row}))});
 }
}
writeFileSync(resolve(output,'results.json'),JSON.stringify(results,null,2));
console.log(JSON.stringify(results.map(({reference,...r})=>r),null,2));
