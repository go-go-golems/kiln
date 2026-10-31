// Compile a frozen static corpus under one explicitly identified fusion policy.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {runScript} from '../../packages/kiln/src/core/script.js';
import {std} from '../../packages/kiln/src/std/index.js';
import {exportProgram} from '../../packages/kiln/src/std/export.js';
import {endToEnd} from '../../apps/workbench/src/compile.js';
const args={};
for(let i=2;i<process.argv.length;i+=2){
 const key=process.argv[i];if(!['--directory','--output','--policy','--target'].includes(key)||!process.argv[i+1])throw new Error('Expected --directory --output --policy --target');
 args[key.slice(2)]=process.argv[i+1];
}
for(const key of ['directory','output','policy','target'])if(!args[key])throw new Error('Missing '+key);
const directory=resolve(args.directory),output=resolve(args.output);
const manifest=JSON.parse(readFileSync(join(directory,'manifest.json'),'utf8'));
if(manifest.format!=='kiln-passnet-corpus/1')throw new Error('Invalid corpus manifest');
const policy=JSON.parse(readFileSync(args.policy,'utf8'));
if(policy.format!=='kiln-fusion-policy/1'||!['unchanged','threshold'].includes(policy.kind)||!/^[a-z0-9-]+$/.test(policy.id))throw new Error('Invalid fusion policy');
if(policy.kind==='threshold'&&(!Number.isFinite(policy.max_work_growth)||policy.max_work_growth<0))throw new Error('Explicit finite threshold required');
const referenceDomainsText=readFileSync(join(directory,'reference-domains.json'),'utf8');
const referenceDomains=JSON.parse(referenceDomainsText);
if(referenceDomains.membership_sha256!==manifest.membership_sha256)throw new Error('Reference domain membership mismatch');
const spec=std.targets[args.target];if(!spec)throw new Error('Unknown target');
const target=std.target(spec);mkdirSync(output,{recursive:true});
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const records=[];
for(const record of manifest.variants){
 const started=performance.now(),decisions=[];
 let result={graph:record.graph,split:record.split,script:record.script,policy:policy.id};
 try{
  const text=readFileSync(join(directory,record.script),'utf8');
  if(hash(text)!==record.source_sha256)throw new Error('Frozen source hash mismatch');
  const parsed=runScript(text);if(!parsed.ok)throw new Error(JSON.stringify(parsed.diags));
  const project=parsed.project;if(project._params.length||project._pipe)throw new Error('Policy corpus must use the static default pipeline');
  const graph=project.graph();
  const domain=referenceDomains.records.find(r=>r.graph===record.graph);if(!domain)throw new Error('Missing reference domain');
  const referenceInputs=project.inputsFor(graph);
  for(const constraint of domain.constraints){
   if(constraint.kind!=='positive'||!referenceInputs[constraint.input])throw new Error('Invalid reference domain');
   const values=referenceInputs[constraint.input].data;
   for(let i=0;i<values.length;i++)values[i]=Math.abs(values[i])+constraint.offset;
  }
  project.data(referenceInputs);
  let pipe=std.emmy.pipeline({target});
  if(policy.kind==='threshold')pipe=pipe.replaceRule('loop/fusion','merge_loop_ops',std.loop.createFusionRule({maxWorkGrowth:policy.max_work_growth,onDecision:event=>decisions.push(event)}));
  const run=pipe.run(graph);if(!run.ok)throw new Error(run.error?.message||'Compilation failed');
  const check=endToEnd(run,graph,project).e2e;
  if(check.error||(!check.skipped&&!check.ok))throw new Error('Reference check failed: '+JSON.stringify(check));
  const artifact=exportProgram(run,std.gpu.programOf(run.graph),{name:'policy-program',target,source:{path:record.script,sha256:record.source_sha256}});
  const artifactName=record.script.replace(/\.js$/,'.json');
  const fingerprint={...artifact};delete fingerprint.name;delete fingerprint.source;
  artifact.compiler_policy=policy;
  writeFileSync(join(output,artifactName),JSON.stringify(artifact,null,1)+'\n');
  result={...result,status:'compiled',artifact:artifactName,fingerprint:hash(fingerprint),kernel_count:artifact.kernels.length,
    kernel_identities:artifact.kernels.map(k=>k.identity),reference_check:check,decisions,compile_ms:performance.now()-started};
 }catch(error){result={...result,status:'failed',error:String(error.stack||error),decisions,compile_ms:performance.now()-started};}
 records.push(result);writeFileSync(join(output,'compile-receipt.json'),JSON.stringify({format:'kiln-policy-compilation/1',membership_sha256:manifest.membership_sha256,reference_domain_sha256:hash(referenceDomainsText),policy,target:args.target,records},null,2)+'\n');
 console.log(policy.id,record.script,result.status,result.kernel_count??result.error);
}
if(records.some(r=>r.status!=='compiled'))process.exitCode=1;
