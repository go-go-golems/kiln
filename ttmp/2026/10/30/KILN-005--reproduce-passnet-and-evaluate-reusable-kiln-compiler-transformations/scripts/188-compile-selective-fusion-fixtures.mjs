// Independent semantic fixtures; no benchmark coverage or speedup claim.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const [rootArg,outputArg]=process.argv.slice(2),root=resolve(rootArg),output=resolve(outputArg);
const {runScript}=await import(join(root,'packages/kiln/src/core/script.js'));
const {std}=await import(join(root,'packages/kiln/src/std/index.js'));
const {exportProgram}=await import(join(root,'packages/kiln/src/std/export.js'));
const {endToEnd}=await import(join(root,'apps/workbench/src/compile.js'));
const sha=x=>createHash('sha256').update(x).digest('hex');
if(existsSync(output))throw new Error('Preserve prior fixture artifacts');mkdirSync(output,{recursive:true});
const policies={unchanged:null,none:()=>false,partial:f=>f.consumerCount>1&&f.consumerIndex===0,all:()=>true};
const records=[];
for(const dtype of ['f32','f16','bf16'])for(const kind of ['elementwise','reduction','nested']){
 const shape=[4,32],small=[4,1];
 const spec={x:shape,y:kind==='elementwise'?shape:small,z:kind==='elementwise'?shape:small};
 const product='N.mul(N.cast(x,"f32"),N.cast(x,"f32"))';
 const p=kind==='elementwise'?'N.exp(N.cast(x,"f32"))':`N.sum(${product},-1)`;
 const a=kind==='nested'?'N.sum(N.add(N.cast(p,"f32"),N.cast(p,"f32")),0)':'N.add(N.cast(p,"f32"),N.cast(y,"f32"))';
 const b='N.mul(N.cast(p,"f32"),N.cast(z,"f32"))';
 const text=`project("selective-fixture").program(({x,y,z})=>{const p=N.cast(${p},${JSON.stringify(dtype)});return {a:N.cast(${a},${JSON.stringify(dtype)}),b:N.cast(${b},${JSON.stringify(dtype)})};}, {${Object.entries(spec).map(([name,shape])=>`${name}:k.tensor(${JSON.stringify(shape)},${JSON.stringify(dtype)})`).join(',')}});\n`;
 const sourceName=`${kind}-${dtype}.kiln.js`;writeFileSync(join(output,sourceName),text);
 for(const [policy,selectConsumer] of Object.entries(policies)){
  const parsed=runScript(text);if(!parsed.ok)throw new Error(JSON.stringify(parsed.diags));const project=parsed.project,graph=project.graph();
  let pipeline=std.emmy.pipeline({target:std.target(std.targets.a100),contraction:'separate'});const decisions=[];
  if(selectConsumer)pipeline=pipeline.replaceRule('loop/fusion','merge_loop_ops',std.loop.createFusionRule({maxWorkGrowth:2,selectConsumer,onDecision:e=>decisions.push(e)}));
  const run=pipeline.run(graph);if(!run.ok)throw new Error(run.error?.message);
  const check=endToEnd(run,graph,project).e2e;if(check.error||check.skipped||!check.ok)throw new Error('Reference fixture failed '+JSON.stringify(check));
  const artifact=exportProgram(run,std.gpu.programOf(run.graph),{name:`${kind}-${dtype}-${policy}`,source:{path:sourceName,sha256:sha(text),contraction:'separate'}});
  const name=`${kind}-${dtype}-${policy}.json`;writeFileSync(join(output,name),JSON.stringify(artifact,null,1)+'\n');
  records.push({kind,dtype,policy,inputs:spec,artifact:name,artifact_sha256:sha(readFileSync(join(output,name))),kernels:artifact.kernels.length,decisions,
   reference_check:check,retained_partial_decisions:decisions.filter(e=>e.retainedProducer&&e.accepted&&e.selectedConsumerCount<e.consumerCount).length});
  console.log(name,'compiled',artifact.kernels.length);
 }
}
writeFileSync(join(output,'manifest.json'),JSON.stringify({format:'kiln-selective-fusion-fixtures/1',scope:'Independent mathematical fixtures, not PassBench acceptance',records},null,2)+'\n');
