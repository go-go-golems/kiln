import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const ticket=resolve(import.meta.dirname,'..');
const load=p=>import(pathToFileURL(resolve(p)).href);
const {optimizationArtifact}=await load('integrations/passnet/optimization_artifact.mjs');
const {prepareOptimizationProgram}=await load('integrations/passnet/transformation_program.mjs');
const {runScript}=await load('packages/kiln/src/core/script.js');
const {std}=await load('packages/kiln/src/std/index.js');
const {exportProgram}=await load('packages/kiln/src/std/export.js');
const {endToEnd}=await load('apps/workbench/src/compile.js');
const program={format:'kiln-transformation-program/1',id:'sequence',kind:'fusion-sequence',
 expose:{format:'kiln-fusion-policy/1',id:'expose',kind:'selective',tree:{threshold:1.02},consumer_tree:{threshold:2}},
 cleanup:{format:'kiln-fusion-policy/1',id:'cleanup',kind:'threshold',max_work_growth:1.02}};
const numerical={contraction:'separate'};
const artifact=optimizationArtifact(program,numerical);
const renamed=structuredClone(program);renamed.id='renamed';renamed.expose.id='other';renamed.cleanup.provenance={note:'metadata'};
assert.equal(artifact.artifact_sha256,optimizationArtifact(renamed,numerical).artifact_sha256);
assert.throws(()=>optimizationArtifact({...program,cleanup:{...program.cleanup,max_work_growth:3}},numerical),/Threshold/);
assert.throws(()=>optimizationArtifact({...program,cleanup:{format:'kiln-fusion-policy/1',id:'none',kind:'unchanged'}},numerical),/explicit/);
assert.throws(()=>optimizationArtifact({...program,steps:[]},numerical),/Invalid transformation/);
const results=[];
for(const index of [3,6,7,8,10,11]) {
 const source=readFileSync(resolve(ticket,'sources/pi-six-lane-study-v1/corpus',String(index).padStart(3,'0')+'.kiln.js'),'utf8');
 const project=runScript(source).project, graph=project.graph(),target=std.target(std.targets.a100);
 const variants=[];
 for(const policy of [{format:'kiln-transformation-program/1',id:'fixed',kind:'scheduling-fusion'},artifact.artifact.program]) {
  const prepared=prepareOptimizationProgram(policy);
  const run=prepared.transform(std.emmy.pipeline({target,...numerical}),target).run(graph);
  assert.equal(run.ok,true,run.error?.message);
  const check=endToEnd(run,graph,project).e2e;
  assert.ok(!check.error&&(check.skipped||check.ok),JSON.stringify(check));
  variants.push(exportProgram(run,std.gpu.programOf(run.graph),{name:'sequence-test',target}));
 }
 assert.deepEqual(variants[1],variants[0]);
 results.push({index,identical:true,kernels:variants[0].kernels.length});
}
writeFileSync(resolve(ticket,'sources/agent-fusion-sequence-validation-v1.json'),JSON.stringify({status:'passed',artifact:artifact.artifact,results},null,2)+'\n');
console.log('Agent sequence exactly reproduces fixed staged executable on six changed development graphs; reference checks pass.');
