// Reuse frozen independent source equations; compile the new region planners.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const [rootArg,sourceArg,outputArg]=process.argv.slice(2),root=resolve(rootArg),source=resolve(sourceArg),output=resolve(outputArg);
const {runScript}=await import(join(root,'packages/kiln/src/core/script.js'));
const {std}=await import(join(root,'packages/kiln/src/std/index.js'));
const {exportProgram}=await import(join(root,'packages/kiln/src/std/export.js'));
const {endToEnd}=await import(join(root,'apps/workbench/src/compile.js'));
const sha=x=>createHash('sha256').update(x).digest('hex');
if(existsSync(output))throw new Error('Preserve previous fixture artifacts');mkdirSync(output,{recursive:true});
const fixtures=JSON.parse(readFileSync(join(source,'manifest.json'),'utf8')).records.filter(r=>r.policy==='unchanged'),records=[];
for(const fixture of fixtures)for(const [policy,launchWork,materializationWork] of [['work',0,0],['launch',32768,0],['materialization',0,12],['combined',32768,12]]){
 const filename=`${fixture.kind}-${fixture.dtype}.kiln.js`,text=readFileSync(join(source,filename),'utf8');writeFileSync(join(output,filename),text);
 const parsed=runScript(text);if(!parsed.ok)throw new Error(JSON.stringify(parsed.diags));const project=parsed.project,graph=project.graph(),decisions=[];
 const pipeline=std.emmy.pipeline({target:std.target(std.targets.a100),contraction:'separate'})
  .replaceRule('loop/fusion','merge_loop_ops',std.loop.createFusionRule({maxWorkGrowth:1.02,selectConsumers:r=>std.loop.chooseFusionSubset(r,{launchWork,materializationWork,maxWorkGrowth:1.02}),onDecision:e=>decisions.push(e)}));
 const run=pipeline.run(graph);if(!run.ok)throw new Error(run.error?.message);
 const check=endToEnd(run,graph,project).e2e;if(check.error||check.skipped||!check.ok)throw new Error('Reference fixture failed '+JSON.stringify(check));
 const artifact=exportProgram(run,std.gpu.programOf(run.graph),{name:`${fixture.kind}-${fixture.dtype}-${policy}`,source:{path:filename,sha256:sha(text),contraction:'separate'}});
 const name=`${fixture.kind}-${fixture.dtype}-${policy}.json`;writeFileSync(join(output,name),JSON.stringify(artifact,null,1)+'\n');
 records.push({kind:fixture.kind,dtype:fixture.dtype,inputs:fixture.inputs,policy,artifact:name,artifact_sha256:sha(readFileSync(join(output,name))),kernels:artifact.kernels.length,decisions,reference_check:check});
 console.log(name,'compiled',artifact.kernels.length);
}
writeFileSync(join(output,'manifest.json'),JSON.stringify({format:'kiln-selective-fusion-fixtures/1',scope:'Independent whole-region fusion fixtures, not PassBench acceptance',records},null,2)+'\n');
