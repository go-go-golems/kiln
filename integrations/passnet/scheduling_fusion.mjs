// Experimental staged fusion derived from the measured GLM selective policy.
// Preserve producers whose cheapest analytic schedule is tiled. This is a
// research heuristic, not a complete fused-versus-materialized cost comparison.
import { k, P } from '../../packages/kiln/src/core/kiln.js';
import { createFusionRule } from '../../packages/kiln/src/std/loop.js';
import { analyze, forkTree, estimate } from '../../packages/kiln/src/std/tile.js';

export function preferredMapping(an, target) {
  const levels = forkTree(an, target).leaf(() => {}).meta.tree;
  const best = {};
  function visit(index, knobs) {
    if (index === levels.length) {
      const us = estimate(an, knobs, target).us;
      if (!best[knobs.MAP] || us < best[knobs.MAP].us) best[knobs.MAP] = { us, knobs };
      return;
    }
    const { p, valuesFn } = levels[index];
    for (const value of valuesFn(knobs)) visit(index + 1, { ...knobs, [p.name]: value });
  }
  visit(0, {});
  return Object.entries(best).sort((a, b) => a[1].us - b[1].us)[0]?.[0];
}

export function applySchedulingFusion(pipeline, target, options = {}) {
  const expose = createFusionRule(options.expose ? {
    decide: options.expose.decide, selectConsumers: options.expose.selectConsumers,
    onDecision: options.onDecision,
  } : {
    selectConsumers: region => region.consumers.flatMap((edge, index) =>
      edge.fusedConsumerWork <= 2 * edge.consumerWork ? [index] : []),
  });
  const cleanup = createFusionRule(options.cleanup ? {
    decide: options.cleanup.decide, selectConsumers: options.cleanup.selectConsumers,
    onDecision: options.onDecision,
  } : {}).match(P.op('loop.kernel').as('p').where(({ p, graph }) => {
    if (graph.isOutput(p.id) || !p.users.length || !p.users.every(u => u.is('loop.kernel'))) return false;
    const an = analyze(p.attrs.expr, p.attrs.shape, p.args.map(a => a.type.shape));
    return !an.contraction || preferredMapping(an, target) !== 'tiled';
  }));
  const pass = k.pass('loop/scheduling-fusion').rules(cleanup).order('reverse')
    .describe('refuse further fusion of producers with preferred tiled schedules');
  return pipeline.replaceRule('loop/fusion', 'merge_loop_ops', expose)
    .insertAfter('loop/fusion', pass);
}
