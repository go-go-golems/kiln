// Inspect reusable staged fusion on the newly qualified slow convolution/pool graph.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const T=resolve(import.meta.dirname,'..'),load=p=>import(pathToFileURL(resolve(p)).href);
const {runScript}=await load('packages/kiln/src/core/script.js');
const {std}=await load('packages/kiln/src/std/index.js');
const {applyPointwiseConvolution}=await load('integrations/passnet/pointwise_convolution.mjs');
const {applySchedulingFusion}=await load('integrations/passnet/scheduling_fusion.mjs');
const {exportProgram}=await load('packages/kiln/src/std/export.js');
const {analyze}=await load('packages/kiln/src/std/tile.js');
const source=readFileSync(resolve(T,'sources/avg-pooling-task-results-v1/task-101/corpus/005.kiln.js'),'utf8');
const out=resolve(T,'sources/pointwise-convolution-probe-v1');mkdirSync(out);
const project=runScript(source).project,graph=project.graph(),target=std.target(std.targets.a100),rows=[];
for(const name of ['baseline','pointwise','pointwise-staged']){
 let pipe=std.emmy.pipeline({target,contraction:'separate'});
 if(name!=='baseline')pipe=applyPointwiseConvolution(pipe);
 if(name==='pointwise-staged')pipe=applySchedulingFusion(pipe,target);
 const start=performance.now(),run=pipe.run(graph);if(!run.ok)throw new Error(run.error?.message);
 const artifact=exportProgram(run,std.gpu.programOf(run.graph),{name:'pooling-probe',target});
 writeFileSync(resolve(out,name+'.json'),JSON.stringify(artifact));
 const loop=[];
 for(const n of run.at('loop').nodes.values())if(n.name==='loop.kernel'){
  const an=analyze(n.attrs.expr,n.attrs.shape,n.args.map(id=>run.at("loop").node(id).type.shape));
  loop.push({shape:n.attrs.shape,contraction:!!an.contraction});
 }
 rows.push({name,compile_ms:performance.now()-start,loop,kernels:artifact.kernels.map(k=>({shape:k.shape,row:k.row,grid:k.grid,block:k.block}))});
}
writeFileSync(resolve(out,'results.json'),JSON.stringify(rows,null,2)+'\n');console.log(JSON.stringify(rows,null,2));
