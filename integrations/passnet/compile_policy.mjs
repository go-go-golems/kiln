// Compile a frozen static corpus under one explicitly identified fusion policy.
import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {runScript} from '../../packages/kiln/src/core/script.js';
import {std} from '../../packages/kiln/src/std/index.js';
import {exportProgram} from '../../packages/kiln/src/std/export.js';
import {endToEnd} from '../../apps/workbench/src/compile.js';
import {prepareFusionPolicy} from './fusion_policy.mjs';
const args={};
for(let i=2;i<process.argv.length;i+=2){
 const key=process.argv[i];if(!['--directory','--output','--policy','--target','--phase'].includes(key)||!process.argv[i+1])throw new Error('Expected --directory --output --policy --target [--phase train|heldout|all]');
 args[key.slice(2)]=process.argv[i+1];
}
for(const key of ['directory','output','policy','target'])if(!args[key])throw new Error('Missing '+key);
const directory=resolve(args.directory),output=resolve(args.output);
const manifest=JSON.parse(readFileSync(join(directory,'manifest.json'),'utf8'));
if(manifest.format!=='kiln-passnet-corpus/1')throw new Error('Invalid corpus manifest');
const phase=args.phase||'all';if(!['train','heldout','all'].includes(phase))throw new Error('Invalid compilation phase');
const numericalPolicy=Object.hasOwn(manifest,'numerical_policy')?manifest.numerical_policy:{contraction:'allow'};
if(!numericalPolicy||typeof numericalPolicy!=='object'||Array.isArray(numericalPolicy)||Object.keys(numericalPolicy).length!==1||!['allow','separate'].includes(numericalPolicy.contraction))throw new Error('Invalid fixed numerical policy');
const policy=JSON.parse(readFileSync(args.policy,'utf8'));
const preparedPolicy=prepareFusionPolicy(policy);
const referenceDomainsText=readFileSync(join(directory,'reference-domains.json'),'utf8');
const referenceDomains=JSON.parse(referenceDomainsText);
if(referenceDomains.membership_sha256!==manifest.membership_sha256)throw new Error('Reference domain membership mismatch');
const spec=std.targets[args.target];if(!spec)throw new Error('Unknown target');
const target=std.target(spec);
if(existsSync(output)&&readdirSync(output).length)throw new Error('Preserve earlier artifacts; choose a new output directory');
mkdirSync(output,{recursive:true});
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const records=[];
for(const record of manifest.variants.filter(r=>phase==='all'||r.split===phase)){
 const started=performance.now(),decisions=[];
 let result={graph:record.graph,split:record.split,script:record.script,policy:policy.id};
 try{
  const text=readFileSync(join(directory,record.script),'utf8');
  if(hash(text)!==record.source_sha256)throw new Error('Frozen source hash mismatch');
  const parsed=runScript(text);if(!parsed.ok)throw new Error(JSON.stringify(parsed.diags));
  const project=parsed.project;if(project._params.length||project._pipe)throw new Error('Policy corpus must use the static default pipeline');
  const graph=project.graph();
  const domain=referenceDomains.records.find(r=>r.graph===record.graph);if(!domain)throw new Error('Missing reference domain');
  const explicitData=project._data;
  let referenceInputs;
  // Sample original defaults once, independent of an embedded source-domain
  // setup. Restrict allocation to constrained inputs and retain all other data.
  try{project.data(null);referenceInputs=project.inputsFor(graph,{names:domain.constraints.map(c=>c.input)});}
  finally{project.data(explicitData);}
  for(const constraint of domain.constraints){
   if(constraint.kind!=='positive'||!referenceInputs[constraint.input]||!Number.isFinite(constraint.offset)||constraint.offset<=0)throw new Error('Invalid reference domain');
   const values=referenceInputs[constraint.input].data;
   for(let i=0;i<values.length;i++)values[i]=Math.abs(values[i])+constraint.offset;
  }
  project.data({...explicitData,...referenceInputs});
  let pipe=std.emmy.pipeline({target,contraction:numericalPolicy.contraction});
  if(preparedPolicy.apply)pipe=pipe.replaceRule('loop/fusion','merge_loop_ops',std.loop.createFusionRule({decide:preparedPolicy.decide,selectConsumers:preparedPolicy.selectConsumers,onDecision:event=>decisions.push(event)}));
  const run=pipe.run(graph);if(!run.ok)throw new Error(run.error?.message||'Compilation failed');
  const check=endToEnd(run,graph,project).e2e;
  if(check.error||(!check.skipped&&!check.ok))throw new Error('Reference check failed: '+JSON.stringify(check));
  const artifact=exportProgram(run,std.gpu.programOf(run.graph),{name:'policy-program',target,source:{path:record.script,sha256:record.source_sha256,contraction:numericalPolicy.contraction}});
  const artifactName=record.script.replace(/\.js$/,'.json');
  const fingerprint={...artifact};delete fingerprint.name;delete fingerprint.source;
  artifact.compiler_policy=policy;
  writeFileSync(join(output,artifactName),JSON.stringify(artifact,null,1)+'\n');
  result={...result,status:'compiled',artifact:artifactName,fingerprint:hash(fingerprint),kernel_count:artifact.kernels.length,
    kernel_identities:artifact.kernels.map(k=>k.identity),reference_check:check,decisions,compile_ms:performance.now()-started};
 }catch(error){result={...result,status:'failed',error:String(error.stack||error),decisions,compile_ms:performance.now()-started};}
 records.push(result);writeFileSync(join(output,'compile-receipt.json'),JSON.stringify({format:'kiln-policy-compilation/2',membership_sha256:manifest.membership_sha256,reference_domain_sha256:hash(referenceDomainsText),policy,policy_node_count:preparedPolicy.nodeCount,target:args.target,phase,numerical_policy:numericalPolicy,records},null,2)+'\n');
 console.log(policy.id,record.script,result.status,result.kernel_count??result.error);
}
if(records.some(r=>r.status!=='compiled'))process.exitCode=1;
