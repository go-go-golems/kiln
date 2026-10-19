// Scenario C — an intentionally incomplete explanation (visualization contract, scenario C).
// Trace #2 lost an interval, a library kernel has no symbols, and PC sampling was never collected.
// Ask the assistant what can still be concluded, then let it plan a re-trace that a person approves.
const RANGES = ['preprocess', 'layout_key', 'graph_lookup', 'capture', 'replay_submit', 'cpu_result', 'serialize'];

return lab('Scenario C · incomplete evidence')
  .experiment('emb-churn', e => e
    .workload(embedding({ provider: 'gemma', contract: 'optimization/server.py', batching: 'upstream-sort' }))
    .boundary('service_response')
    .baseline(rev('488d9f41')).candidate(rev('3496baed'))
    .host('playback@dgx')
    .phases(p => p
      .stable('one-layout', { layouts: 1 })
      .alternate('two-layouts', { layouts: 2 })
      .churn('over-capacity', { layouts: ctx => ctx.adapter.graphCache.capacity + 2 }))
    .offer(schedule.poisson({ rate: '6/s', duration: '120s', seed: 7 }))
    .admission({ maxOutstanding: 16 }).deadline('2s').drain('30s')
    .units('request', 'window')
    .gate(quality.ref('spikes/19-embedding-comparison/optimization/quality_gate.py'))
    .repeat({ processes: 3, order: paired({ seed: 11 }) })
    .capture(capture.timing(), capture.trace().ranges(RANGES)))
  .board('gaps', b => {
    const run = b.param('run', pickRun('*/candidate/trace').label('Trace run').default('emb-churn/candidate/trace#2'));
    const sel = b.sig('sel', null);
    b.title('What can still be concluded?')
     .subtitle('Missing evidence stays missing: hatched intervals, unknown counters, unmapped source')
     .add(manifest(run))
     .add(timeline(run).lanes('cpu:worker', 'cuda:stream 3').window([36, 50]).focus(sel).as('timeline')
       .on('select', $ => $.set(sel, $.entity)))
     .add(kernelCard(live($ => ($(sel)?.kind === 'kernel' ? $(sel) : null))));
  });
