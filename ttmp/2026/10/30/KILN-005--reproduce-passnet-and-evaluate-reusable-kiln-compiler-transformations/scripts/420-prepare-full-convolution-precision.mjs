// Full-geometry witness plus independent scalar algorithm comparisons.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const ticket=resolve(dirname(fileURLToPath(import.meta.url)),'..'),root=resolve(ticket,'../../../../..');
const {compileScript}=await import(resolve(root,'apps/workbench/src/compile.js'));
const {params}=await import(resolve(root,'packages/kiln/src/core/kiln.js'));
const {target,SPECS}=await import(resolve(root,'packages/kiln/src/std/targets.js'));
const source=resolve(ticket,'sources/singleton-view-source-cohort-v1/task-010/corpus/001.kiln.js');
const sourceText=readFileSync(source,'utf8');
const c=compileScript(sourceText,{params:params([]),target:target(SPECS.a100),contraction:'separate'});
assert.ok(c.ok,JSON.stringify(c.diags));
const inputs=c.project.inputsFor(c.graph),values=new Map();
const frontend=c.graph.eval(inputs,{values}).out0;
const loop=c.run.at('loop').eval(inputs).out0;
const output=resolve(ticket,'sources/singleton-full-precision-v2');mkdirSync(output,{recursive:true});
const inputFiles={};
for(const [name,value] of Object.entries(inputs)){
 const bytes=Buffer.alloc(value.data.length*4);
 value.data.forEach((v,i)=>bytes.writeFloatLE(v,i*4));
 writeFileSync(resolve(output,name+'.f32'),bytes);
 inputFiles[name]={file:name+'.f32',shape:value.shape,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
}
const f=Math.fround;
function accumulate(terms,mode){
 if(mode==='pairwise'){
  let size=terms.length;
  while(size>1){let next=0;for(let i=0;i<size;i+=2)terms[next++]=i+1<size?f(terms[i]+terms[i+1]):terms[i];size=next;}
  return terms[0];
 }
 let sum=0,comp=0;
 for(const term of terms){
  if(mode==='kahan'){const y=f(term-comp),t=f(sum+y);comp=f(f(t-sum)-y);sum=t;}
  else if(mode==='neumaier'){const t=f(sum+term),e=Math.abs(sum)>=Math.abs(term)?f(f(sum-t)+term):f(f(term-t)+sum);comp=f(comp+e);sum=t;}
  else sum=f(sum+term);
 }
 return mode==='neumaier'?f(sum+comp):sum;
}
function compare(actual,want){
 let different=0,failed=0,maxAbs=0;
 for(let i=0;i<want.data.length;i++){
  const error=Math.abs(actual.data[i]-want.data[i]);assert.ok(Number.isFinite(error));
  if(error)different++;if(error>1e-4+1e-3*Math.abs(want.data[i]))failed++;maxAbs=Math.max(error,maxAbs);
 }
 return {different,failed,max_abs:maxAbs};
}
const conv=[...c.graph.nodes.values()].find(n=>n.name==='nn.conv2d');
const [x,w,b]=conv.args.map(id=>values.get(id));assert.deepEqual(w.shape,[1,608,1,1]);
const algorithms=[];
for(const mode of ['sequential','pairwise','kahan','neumaier']){
 let intermediate;
 const got=c.graph.eval(inputs,{onNode(node,value){
  if(node.id!==conv.id)return;
  const terms=new Float32Array(608),before={data:value.data.slice()};
  for(let batch=0;batch<128;batch++)for(let spatial=0;spatial<48;spatial++){
   for(let channel=0;channel<608;channel++)terms[channel]=f(x.data[(batch*608+channel)*48+spatial]*w.data[channel]);
   value.data[batch*48+spatial]=f(accumulate(terms,mode)+b.data[0]);
  }
  intermediate=compare(value,before);
 }}).out0;
 algorithms.push({mode,convolution_against_double_reference:intermediate,output_against_frontend:compare(got,frontend)});
}
const result={format:'kiln-full-convolution-precision-inputs/2',source_sha256:createHash('sha256').update(sourceText).digest('hex'),
 input_files:inputFiles,frontend_output:Array.from(frontend.data),loop_output:Array.from(loop.data),algorithms,
 scope:'Full deterministic original geometry. Scalar algorithm probes are not compiler implementations or GPU qualification.'};
writeFileSync(resolve(output,'inputs.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({input_files:inputFiles,algorithms},null,2));
