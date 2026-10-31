import assert from 'node:assert/strict';
import {optimizationArtifact} from './optimization_artifact.mjs';
import {prepareFusionPolicy} from './fusion_policy.mjs';

const policy = {format:'kiln-fusion-policy/1', id:'first', kind:'threshold', max_work_growth:1.02};
const numerical = {contraction:'separate'};
const first = optimizationArtifact(policy, numerical);
assert.equal(first.artifact_sha256, optimizationArtifact({
  max_work_growth:1.02, kind:'threshold', id:'another-name', format:'kiln-fusion-policy/1',
  provenance:{author:'different metadata'},
}, numerical).artifact_sha256);
assert.notEqual(first.artifact_sha256, optimizationArtifact({...policy,max_work_growth:1.03}, numerical).artifact_sha256);
assert.notEqual(first.artifact_sha256, optimizationArtifact(policy,{contraction:'allow'}).artifact_sha256);
policy.max_work_growth=2;
numerical.contraction='allow';
assert.equal(first.artifact.program.max_work_growth,1.02);
assert.equal(first.artifact.numerical_policy.contraction,'separate');
const decision=prepareFusionPolicy(first.artifact.program).decide;
assert.equal(decision({originalWork:100,fusedWork:101,producerElements:16,consumerCount:1}),true);
assert.equal(typeof decision({originalWork:100,fusedWork:103,producerElements:16,consumerCount:1}),'string');
assert.throws(()=>optimizationArtifact({...policy, tolerance:1},numerical),/Unknown/);
assert.throws(()=>optimizationArtifact({...policy, max_work_growth:NaN},numerical),/non-finite/);
assert.throws(()=>optimizationArtifact({...policy, provenance:{lost:undefined}},numerical),/undefined/);
assert.throws(()=>optimizationArtifact(policy,{contraction:'separate',rtol:1}),/host numerical/);
console.log('artifact identity, semantic separation, detached data and executable policy round-trip passed');

// A frontend decomposition must have a distinct contract from loop-only fusion.
const stage={format:'kiln-fusion-policy/1',id:'stage',kind:'threshold',max_work_growth:1.02};
const sequence={format:'kiln-transformation-program/1',id:'pointwise',kind:'pointwise-fusion-sequence',expose:stage,cleanup:stage};
const pointwise=optimizationArtifact(sequence,{contraction:'separate'});
assert.equal(pointwise.artifact.input_ir,'kiln-tensor/1');
assert.equal(pointwise.artifact.action_contract,'kiln-pointwise-staged-fusion/1');
assert.notEqual(pointwise.artifact_sha256,optimizationArtifact({...sequence,kind:'fusion-sequence'},{contraction:'separate'}).artifact_sha256);
assert.equal(pointwise.artifact_sha256,optimizationArtifact({...sequence,id:'renamed',expose:{...stage,id:'other',provenance:{author:'test'}}},{contraction:'separate'}).artifact_sha256);
assert.throws(()=>optimizationArtifact({...sequence,numerical_policy:{contraction:'allow'}},{contraction:'separate'}),/Invalid/);
console.log('pointwise composition contract, identity and host numerical policy passed');
