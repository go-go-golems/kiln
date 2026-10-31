// Known no-convolution families: test collateral staged-fusion changes, not transfer.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const T=resolve(import.meta.dirname,'..'),load=p=>import(pathToFileURL(resolve(p)).href);
const {runScript}=await load('packages/kiln/src/core/script.js');
const {std}=await load('packages/kiln/src/std/index.js');
const {exportProgram}=await load('packages/kiln/src/std/export.js');
const {prepareOptimizationProgram}=await load('integrations/passnet/transformation_program.mjs');
const program=JSON.parse(readFileSync(resolve(T,'sources/pointwise-agent-program-validation-v1.json'))).artifact.artifact.program;
const prepared=prepareOptimizationProgram(program),target=std.target(std.targets.a100),results=[];
for(const task of ['012','016']){
 const dir=resolve(T,`sources/avg-pooling-task-results-v1/task-${task}/corpus`);
 const manifest=JSON.parse(readFileSync(resolve(dir,'manifest.json')));
 for(const row of manifest.variants){
  const project=runScript(readFileSync(resolve(dir,row.script),'utf8')).project;
  const artifacts=[];
  for(const candidate of [false,true]){
   let pipe=std.emmy.pipeline({target,contraction:'separate'});
   if(candidate)pipe=prepared.transform(pipe,target);
   const run=pipe.run(project.graph());if(!run.ok)throw new Error(run.error?.message);
   artifacts.push(exportProgram(run,std.gpu.programOf(run.graph),{name:'negative-control',target}));
  }
  const hashes=artifacts.map(a=>createHash('sha256').update(JSON.stringify(a)).digest('hex'));
  results.push({task,script:row.script,identical:hashes[0]===hashes[1],hashes,kernels:artifacts.map(a=>a.kernels.length)});
  console.log(task,row.script,results.at(-1).identical?'identical':'changed');
 }
}
writeFileSync(resolve(T,'sources/pointwise-negative-controls-v1.json'),JSON.stringify({scope:'Known no-convolution development families; compilation identity only, no new GPU measurement',results},null,2)+'\n');
