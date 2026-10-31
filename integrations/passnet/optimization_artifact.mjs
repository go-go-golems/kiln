// The native agent proposes policy data; the host supplies the numerical contract.
// Reuse evidence canonicalization rather than defining a second JSON identity.
import {canonicalJSON} from '../../packages/evidence/src/canonical.ts';
import {sha256Hex} from '../../packages/evidence/src/sha256.ts';
import {prepareOptimizationProgram} from './transformation_program.mjs';
import {pathToFileURL} from 'node:url';

export function optimizationArtifact(policy, numericalPolicy) {
  if (!numericalPolicy || Object.keys(numericalPolicy).length !== 1 ||
      !['allow', 'separate'].includes(numericalPolicy.contraction)) {
    throw new TypeError('Expected the host numerical policy');
  }
  // Validate before dropping metadata: forbidden fields must not disappear.
  canonicalJSON(policy);
  prepareOptimizationProgram(policy);
  const program = JSON.parse(canonicalJSON(policy));
  delete program.provenance;
  // Names affect diagnostics, not the policy's executable decisions.
  program.id = 'artifact-policy';
  if (['fusion-sequence', 'pointwise-fusion-sequence'].includes(program.kind)) {
    for (const stage of ['expose', 'cleanup']) {
      program[stage].id = stage;
      delete program[stage].provenance;
    }
  }
  const artifact = {
    format: 'kiln-optimization-artifact/1',
    input_ir: program.kind === 'pointwise-fusion-sequence' ? 'kiln-tensor/1' : 'kiln-loop/1',
    action_contract: program.kind === 'pointwise-fusion-sequence' ? 'kiln-pointwise-staged-fusion/1' : program.format === 'kiln-transformation-program/1' ? 'kiln-staged-loop-fusion/1' : 'kiln-loop-fusion/1',
    feature_contract: 'kiln-loop-fusion-features/1',
    numerical_policy: {...numericalPolicy},
    applicability: {pipeline: 'emmy', static_shapes: true},
    program_budget: {max_nodes: 31, max_depth: 6, max_work_growth: 2},
    program,
  };
  return {artifact, artifact_sha256: sha256Hex(canonicalJSON(artifact))};
}

// One request per process. Importing this module never consumes stdin.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  try {
    const request = JSON.parse(input);
    if (!request || Object.keys(request).sort().join(',') !== 'numerical_policy,policy') {
      throw new TypeError('Expected policy and host numerical_policy only');
    }
    console.log(JSON.stringify({status: 'valid', ...optimizationArtifact(request.policy, request.numerical_policy)}));
  } catch (error) {
    console.log(JSON.stringify({status: 'invalid', error: String(error.message)}));
    process.exitCode = 2;
  }
}
