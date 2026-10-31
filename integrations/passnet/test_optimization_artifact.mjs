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
