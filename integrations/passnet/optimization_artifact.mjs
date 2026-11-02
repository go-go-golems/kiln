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
  const program = anonymize(JSON.parse(canonicalJSON(policy)), 'artifact-policy');
  // A cost gate chooses between the untransformed and the inner compilation; its contract
  // is the inner program's contract plus the selection rule.
  const acting = program.kind === 'cost-gated' ? program.program : program;
  const contract = acting.kind === 'pointwise-fusion-sequence' ? 'kiln-pointwise-staged-fusion/1' : acting.format === 'kiln-transformation-program/1' ? 'kiln-staged-loop-fusion/1' : 'kiln-loop-fusion/1';
  const artifact = {
    format: 'kiln-optimization-artifact/1',
    input_ir: acting.kind === 'pointwise-fusion-sequence' ? 'kiln-tensor/1' : 'kiln-loop/1',
    action_contract: program.kind === 'cost-gated' ? `kiln-predicted-cost-gate/1+${contract}` : contract,
    feature_contract: 'kiln-loop-fusion-features/1',
    numerical_policy: {...numericalPolicy},
    applicability: {pipeline: 'emmy', static_shapes: true},
    program_budget: {max_nodes: 31, max_depth: 6, max_work_growth: 2},
    program,
  };
  return {artifact, artifact_sha256: sha256Hex(canonicalJSON(artifact))};
}

// Names and provenance affect diagnostics, not the program's executable decisions.
function anonymize(program, id) {
  delete program.provenance;
  program.id = id;
  if (['fusion-sequence', 'pointwise-fusion-sequence'].includes(program.kind)) {
    for (const stage of ['expose', 'cleanup']) anonymize(program[stage], stage);
  }
  if (program.kind === 'cost-gated') anonymize(program.program, 'gated');
  return program;
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
