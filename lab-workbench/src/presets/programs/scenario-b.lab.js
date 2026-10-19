// Scenario B — embedding layout churn (visualization contract, scenario B).
// Connect latency to a graph capture, eviction or fallback; keep request and window units apart;
// never infer graph compatibility from tensor shape alone.
const RANGES = ['preprocess', 'layout_key', 'graph_lookup', 'capture', 'replay_submit', 'cpu_result', 'serialize'];

return lab('Scenario B · embedding layout churn')
  .experiment('emb-churn', e => e
    .question('How do physical layouts and the graph cache shape latency under continuous offer?')
    .param('rate', slider({ min: 2, max: 10, step: 1, unit: 'req/s' }).label('Offered rate').default(6))
    .workload(embedding({ provider: 'gemma', contract: 'optimization/server.py', batching: 'upstream-sort' }))
    .boundary('service_response')
    .baseline(rev('488d9f41')).candidate(rev('3496baed'))
    .host('playback@dgx')
    .phases(p => p
      .stable('one-layout', { layouts: 1 })
      .alternate('two-layouts', { layouts: 2 })
      .churn('over-capacity', { layouts: ctx => ctx.adapter.graphCache.capacity + 2 }))   // more layouts than the cache holds
    .offer(ctx => schedule.poisson({ rate: `${ctx.param('rate')}/s`, duration: '120s', seed: 7 }))
    .admission({ maxOutstanding: 16 }).deadline('2s').drain('30s')
    .units('request', 'window')
    .gate(quality.ref('spikes/19-embedding-comparison/optimization/quality_gate.py'))
    .repeat({ processes: 3, order: paired({ seed: 11 }) })
    .capture(capture.timing(), capture.trace().ranges(RANGES), capture.memory().ledgers('allocator', 'process', 'graph')))
  .derive('transitions', q.instants('emb-churn/candidate/trace#0').kind('graph.*'), xs => xs.map(x => ({
    t: x.t, phase: x.phase, type: x.type, layout: x.layout, generation: x.generation,
  })))
  .derive('throughput', q.requests('emb-churn/*/timing'), rs => rs.groupBy('arm', 'phase').map(g => stats.offered(g)))
  .board('churn', b => {
    const phase = b.param('phase', toggle(['one-layout', 'two-layouts', 'over-capacity']).label('Phase').default('over-capacity'));
    const unit = b.param('unit', toggle(['requests', 'windows']).label('Throughput unit').default('requests'));
    const sel = b.sig('sel', null);
    b.title('Latency follows the graph cache')
     .subtitle(live($ => `Phase ${$(phase)} · arrivals are scheduled, not closed-loop`))
     .add(row()
       .add(stat(live($ => $.read('throughput').find(r => r.arm === 'candidate' && r.phase === $(phase))?.[$(unit) === 'requests' ? 'requestsOnTime' : 'windowsOnTime']),
                 live($ => `candidate ${$(unit)}/s on time`)))
       .add(stat(live($ => $.read('throughput').find(r => r.arm === 'baseline' && r.phase === $(phase))?.[$(unit) === 'requests' ? 'requestsOnTime' : 'windowsOnTime']),
                 live($ => `baseline ${$(unit)}/s on time`)))
       .add(stat(live($ => $.read('throughput').find(r => r.arm === 'candidate' && r.phase === $(phase))?.expired), 'candidate expired per process'))
       .add(stat(live($ => $.read('throughput').find(r => r.arm === 'candidate' && r.phase === $(phase))?.outstandingAtEnd), 'outstanding per process when offer stopped')))
     .add(chart(live($ => q.requests('emb-churn/*/timing#0').phase($(phase))))
       .mark('point').x('scheduledArrival', { unit: 's', label: 'scheduled arrival' }).y('timeInSystem', { unit: 'ms', scale: 'log' })
       .color('arm').shape('outcome')
       .track(live($ => q.read('transitions').where(x => x.phase === $(phase))), { label: 'graph cache (candidate trace #0)' })
       .title('Time in system by scheduled arrival')
       .on('select', $ => $.set(sel, $.row)))
     .add(note('Little’s law, $L=\\lambda W$, relates work in the system to arrival rate and time in system **only for a stable system**. In the over-capacity phase the queue grows, so neither $L$ nor $W$ is a capacity estimate — read on-time throughput and expirations instead.'))
     .add(batchView(live($ => ($(sel)?.kind === 'request' ? q.of($(sel)).follow('contains').kind('batch').first() : null))));
  })
  // Pools are released at eviction, so adding every pool ever captured is not a memory figure.
  // Sweep captures and evictions to find the most bytes the cache held at any one moment.
  .derive('peakRetained', q.graphs('emb-churn/candidate/memory#0'), gs => gs.groupBy('phase').map(g => {
    const events = [...g]
      .flatMap(x => [[x.capturedAt, x.retainedBytes], [x.evictedAt ?? Infinity, -x.retainedBytes]])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let held = 0, peak = 0;
    for (const [, delta] of events) { held += delta; peak = Math.max(peak, held); }
    return { peakRetained: peak, captures: g.length };
  }))
  .board('memory', b => b
    .title('What the graph cache retains')
    .subtitle('Two cached graphs do not imply a fixed byte budget: each layout retains a different pool')
    .add(chart(q.read('peakRetained')).mark('bar').x('phase').y('peakRetained', { unit: 'B' }).title('Peak bytes held by graph pools at one moment'))
    .add(ledger(q.allocs('emb-churn/candidate/memory#0').where(a => a.scope === 'graph' && a.lifetime === 'retained'))
      .groupBy('phase').scope('graph').title('Pools still retained when the offer stopped'))
    .add(table(q.graphs('emb-churn/candidate/memory#0')).cols('id', 'layout', 'phase', 'capturedAt', 'evictedAt', 'retainedBytes')));
