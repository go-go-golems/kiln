// One preparation path for agent validation and corpus compilation.
import { prepareFusionPolicy } from './fusion_policy.mjs';
import { applySchedulingFusion } from './scheduling_fusion.mjs';
import { applyPointwiseConvolution } from './pointwise_convolution.mjs';
import { createFusionRule } from '../../packages/kiln/src/std/loop.js';

export function prepareOptimizationProgram(program) {
  if (program?.format !== 'kiln-transformation-program/1') return prepareFusionPolicy(program);
  if (typeof program.id !== 'string' || !/^[a-z0-9-]+$/.test(program.id)) throw new TypeError('Invalid transformation identity');
  if (program.kind === 'cost-gated') {
    // Compile with and without the inner program and keep the one the analytic cost model
    // predicts is cheaper on the pipeline's target. The exporter performs both compilations.
    if (Object.keys(program).some(k => !['format', 'id', 'kind', 'program'].includes(k))) throw new TypeError('Unknown transformation field');
    if (program.program?.kind === 'cost-gated') throw new TypeError('Nested cost gates are not allowed');
    const inner = prepareOptimizationProgram(program.program);
    return { apply: false, nodeCount: inner.nodeCount, gate: 'predicted-cost', inner };
  }
  if (program.kind === 'scheduling-fusion') {
    if (Object.keys(program).some(k => !['format', 'id', 'kind'].includes(k))) throw new TypeError('Unknown transformation field');
    return { apply: false, nodeCount: 1, transform: applySchedulingFusion };
  }
  const pointwise = program.kind === 'pointwise-fusion-sequence';
  if ((!pointwise && program.kind !== 'fusion-sequence') || Object.keys(program).some(k => !['format', 'id', 'kind', 'expose', 'cleanup'].includes(k))) throw new TypeError('Invalid transformation program');
  const expose = prepareFusionPolicy(program.expose);
  const cleanup = prepareFusionPolicy(program.cleanup);
  if (!expose.apply || !cleanup.apply) throw new TypeError('Both sequence stages require an explicit fusion policy');
  const nodeCount = expose.nodeCount + cleanup.nodeCount + (pointwise ? 1 : 0);
  if (nodeCount > 31) throw new TypeError('Sequence exceeds total node budget');
  return {
    apply: false, nodeCount,
    transform: (pipeline, target, onDecision) => applySchedulingFusion(pointwise ? applyPointwiseConvolution(pipeline) : pipeline, target, { expose, cleanup, onDecision }),
  };
}

/** Apply a validated program to the standard pipeline used by both exporters. */
export function applyOptimizationProgram(pipeline, target, prepared, onDecision = () => {}) {
  if (prepared.gate) throw new TypeError('A cost-gated program selects between two compilations; apply its inner program');
  let result = pipeline;
  if (prepared.apply) {
    result = result.replaceRule('loop/fusion', 'merge_loop_ops', createFusionRule({
      decide: prepared.decide,
      selectConsumers: prepared.selectConsumers,
      onDecision,
    }));
  }
  if (prepared.transform) result = prepared.transform(result, target, onDecision);
  return result;
}
