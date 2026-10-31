import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
const T=resolve(import.meta.dirname,'..'),load=p=>import(pathToFileURL(resolve(p)).href);
const {k}=await load('packages/kiln/src/core/kiln.js');
const {std}=await load('packages/kiln/src/std/index.js');
const {N}=await load('packages/kiln/src/std/tensor.js');
const {exportProgram}=await load('packages/kiln/src/std/export.js');
const {Tensor}=await load('packages/kiln/src/core/util.js');
const fixtures=JSON.parse(readFileSync('packages/kiln/test/fixtures/avg-pool2d-pytorch.json'));
const out=resolve(T,'sources/avg-pooling-cuda-fixtures-v1');mkdirSync(out);
const target=std.target(std.targets.a100),rows=[];
for(const [i,f] of fixtures.cases.entries())for(const dtype of i%24===0?['f32','f16','bf16']:['f32']){
 const graph=k.trace('pool',({x})=>({out:N.avgPool2d(x,f.options)}),{x:k.tensor(f.input.shape,dtype)});
 const run=std.emmy.pipeline({target,contraction:'separate'}).run(graph);
 if(!run.ok)throw new Error(run.error?.message);
 const x=new Tensor(f.input.shape,Float32Array.from(f.input.data));
 const actual=run.graph.eval({x}).out;
 if(actual.data.some((v,j)=>Math.abs(v-f.output.data[j])>(dtype==='f32'?1e-5:0.03)))throw new Error(`Reference ${i} ${dtype}`);
 const artifact=exportProgram(run,std.gpu.programOf(run.graph),{name:'pool',target});
 const filename=`${String(i).padStart(3,'0')}-${dtype}.json`;writeFileSync(resolve(out,filename),JSON.stringify(artifact));
 rows.push({index:i,dtype,artifact:filename,input:f.input,options:f.options});
}
writeFileSync(resolve(out,'manifest.json'),JSON.stringify({source_revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),records:rows},null,2)+'\n');
console.log('exported',rows.length,'CUDA programs');
