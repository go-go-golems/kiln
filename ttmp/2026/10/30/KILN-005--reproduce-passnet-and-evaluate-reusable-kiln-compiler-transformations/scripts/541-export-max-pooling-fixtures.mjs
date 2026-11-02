import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const ticket=resolve(import.meta.dirname,'..'),load=p=>import(pathToFileURL(resolve(p)).href);
const {k}=await load('packages/kiln/src/core/kiln.js');
const {std}=await load('packages/kiln/src/std/index.js');
const {N}=await load('packages/kiln/src/std/tensor.js');
const {exportProgram}=await load('packages/kiln/src/std/export.js');
const {Tensor}=await load('packages/kiln/src/core/util.js');
const fixtures=JSON.parse(readFileSync('packages/kiln/test/fixtures/max-pool2d-pytorch.json'));
const out=resolve(process.argv[2]||resolve(ticket,'sources/max-pooling-cuda-fixtures-v1'));mkdirSync(out,{recursive:true});
const target=std.target(std.targets.a100),rows=[];
for(const [i,f] of fixtures.cases.entries()){
 const dtype=f.input.dtype;
 const graph=k.trace('max-pool',({x})=>({out:N.maxPool2d(x,f.options)}),{x:k.tensor(f.input.shape,dtype)});
 const run=std.emmy.pipeline({target,contraction:'separate'}).run(graph,{params:{MAP:'thread'}});
 if(!run.ok)throw new Error(run.error?.message);
 const x=new Tensor(f.input.shape,Float32Array.from(f.input.data)),actual=run.at('loop').eval({x}).out;
 if(actual.data.some((v,j)=>v!==f.output.data[j]))throw new Error(`Reference ${i} ${dtype}`);
 const artifact=exportProgram(run,std.gpu.programOf(run.graph),{name:'max-pool',target});
 const filename=`${String(i).padStart(3,'0')}-${dtype}.json`;writeFileSync(resolve(out,filename),JSON.stringify(artifact));
 rows.push({index:i,dtype,artifact:filename,input:f.input,options:f.options});
}
writeFileSync(resolve(out,'manifest.json'),JSON.stringify({source_sha256:Object.fromEntries(['packages/kiln/src/std/pooling.js','packages/kiln/src/std/tensor.js','packages/kiln/src/std/emit.js','packages/kiln/src/std/fns.js'].map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')])),records:rows},null,2)+'\n');
console.log('exported',rows.length,'CUDA programs');
