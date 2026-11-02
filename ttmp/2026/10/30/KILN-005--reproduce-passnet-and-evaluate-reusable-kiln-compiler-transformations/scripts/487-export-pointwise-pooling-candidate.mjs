// Export the complete six-graph family under one fixed reusable transformation.
import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const T=resolve(import.meta.dirname,'..'),load=p=>import(pathToFileURL(resolve(p)).href);
const {runScript}=await load('packages/kiln/src/core/script.js');
const {std}=await load('packages/kiln/src/std/index.js');
const {applyPointwiseConvolution}=await load('integrations/passnet/pointwise_convolution.mjs');
const {applySchedulingFusion}=await load('integrations/passnet/scheduling_fusion.mjs');
const {exportProgram}=await load('packages/kiln/src/std/export.js');
const {endToEnd}=await load('apps/workbench/src/compile.js');
const original=resolve(T,'sources/avg-pooling-task-results-v1/task-101/corpus');
const output=resolve(T,'sources/pointwise-pooling-candidate-v1/corpus');mkdirSync(output,{recursive:true});
const manifest=JSON.parse(readFileSync(resolve(original,'manifest.json'))),records=[];
copyFileSync(resolve(original,'manifest.json'),resolve(output,'manifest.json'));
const target=std.target(std.targets.a100);
for(const row of manifest.variants){
 const text=readFileSync(resolve(original,row.script),'utf8');copyFileSync(resolve(original,row.script),resolve(output,row.script));
 const project=runScript(text).project,graph=project.graph();
 const pipe=applySchedulingFusion(applyPointwiseConvolution(std.emmy.pipeline({target,contraction:'separate'})),target);
 const run=pipe.run(graph);if(!run.ok)throw new Error(run.error?.message);
 const check=endToEnd(run,graph,project).e2e;
 if(check.error||(!check.skipped&&!check.ok))throw new Error(JSON.stringify(check));
 const artifact=exportProgram(run,std.gpu.programOf(run.graph),{name:'pointwise-pooling',target});
 const file=row.script.replace(/\.js$/,'.json');writeFileSync(resolve(output,file),JSON.stringify(artifact));
 records.push({graph:row.graph,artifact:file,returncode:0,reference_check:check,kernels:artifact.kernels.map(k=>({shape:k.shape,row:k.row,grid:k.grid,block:k.block}))});
 writeFileSync(resolve(output,'compile-receipt.json'),JSON.stringify(records,null,2)+'\n');
 console.log(row.script,records.at(-1).kernels);
}
