// Check native-agent identity and exact executable equivalence of the measured composition.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const T=resolve(import.meta.dirname,'..'),load=p=>import(pathToFileURL(resolve(p)).href);
const {optimizationArtifact}=await load('integrations/passnet/optimization_artifact.mjs');
const {prepareOptimizationProgram}=await load('integrations/passnet/transformation_program.mjs');
const {runScript}=await load('packages/kiln/src/core/script.js');
const {std}=await load('packages/kiln/src/std/index.js');
const {exportProgram}=await load('packages/kiln/src/std/export.js');
const program={format:'kiln-transformation-program/1',id:'pointwise-staged',kind:'pointwise-fusion-sequence',
 expose:{format:'kiln-fusion-policy/1',id:'expose',kind:'selective',tree:{threshold:1.02},consumer_tree:{threshold:2}},
 cleanup:{format:'kiln-fusion-policy/1',id:'cleanup',kind:'threshold',max_work_growth:1.02}};
const artifact=optimizationArtifact(program,{contraction:'separate'});
assert.equal(artifact.artifact.input_ir,'kiln-tensor/1');
assert.equal(artifact.artifact.action_contract,'kiln-pointwise-staged-fusion/1');
assert.notEqual(artifact.artifact_sha256,optimizationArtifact({...program,kind:'fusion-sequence'},{contraction:'separate'}).artifact_sha256);
const renamed=structuredClone(program);renamed.expose.id='renamed';renamed.cleanup.provenance={author:'metadata'};
assert.equal(artifact.artifact_sha256,optimizationArtifact(renamed,{contraction:'separate'}).artifact_sha256);
assert.throws(()=>optimizationArtifact({...program,numerical_policy:{contraction:'allow'}},{contraction:'separate'}),/Invalid/);
const prepared=prepareOptimizationProgram(artifact.artifact.program);assert.equal(prepared.nodeCount,4);
const target=std.target(std.targets.a100),results=[];
for(let i=0;i<6;i++){
 const name=String(i).padStart(3,'0')+'.kiln';
 const directory=resolve(T,'sources/pointwise-pooling-candidate-v1/corpus');
 const project=runScript(readFileSync(resolve(directory,name+'.js'),'utf8')).project;
 const run=prepared.transform(std.emmy.pipeline({target,contraction:'separate'}),target).run(project.graph());assert.ok(run.ok,run.error?.message);
 const actual=exportProgram(run,std.gpu.programOf(run.graph),{name:'pointwise-pooling',target});
 assert.deepEqual(actual,JSON.parse(readFileSync(resolve(directory,name+'.json'))));
 results.push({graph:i,identical:true,kernels:actual.kernels.length});
}
writeFileSync(resolve(T,'sources/pointwise-agent-program-validation-v1.json'),JSON.stringify({status:'passed',artifact,results},null,2)+'\n');
console.log('Six exact executable comparisons and distinct/canonical agent identity passed.');
