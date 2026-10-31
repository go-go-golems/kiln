// One preparation path for agent validation and corpus compilation.
import { prepareFusionPolicy } from './fusion_policy.mjs';
import { applySchedulingFusion } from './scheduling_fusion.mjs';

export function prepareOptimizationProgram(program) {
  if (program?.format !== 'kiln-transformation-program/1') return prepareFusionPolicy(program);
  if (typeof program.id !== 'string' || !/^[a-z0-9-]+$/.test(program.id)) throw new TypeError('Invalid transformation identity');
  if (program.kind === 'scheduling-fusion') {
    if (Object.keys(program).some(k => !['format', 'id', 'kind'].includes(k))) throw new TypeError('Unknown transformation field');
    return { apply: false, nodeCount: 1, transform: applySchedulingFusion };
  }
  if (program.kind !== 'fusion-sequence' || Object.keys(program).some(k => !['format', 'id', 'kind', 'expose', 'cleanup'].includes(k))) throw new TypeError('Invalid transformation program');
  const expose = prepareFusionPolicy(program.expose);
  const cleanup = prepareFusionPolicy(program.cleanup);
  if (!expose.apply || !cleanup.apply) throw new TypeError('Both sequence stages require an explicit fusion policy');
  if (expose.nodeCount + cleanup.nodeCount > 31) throw new TypeError('Sequence exceeds total node budget');
  return {
    apply: false, nodeCount: expose.nodeCount + cleanup.nodeCount,
    transform: (pipeline, target, onDecision) => applySchedulingFusion(pipeline, target, { expose, cleanup, onDecision }),
  };
}
