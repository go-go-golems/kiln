// Two traces run on two clocks. A comparison is a structural match, never one shared timeline.
const RANGES = ['decode', 'normalize', 'tokenize', 'replay_submit', 'postprocess', 'cpu_result'];

return lab('Compare runs')
  .experiment('dino-warm', e => e
    .workload(dino({ fixtures: 'coco-128', precision: 'fp16', inputSize: 768 }))
    .boundary('backend_cpu_result')
    .baseline(rev('a6f14d94')).candidate(rev('d59d9ad0'))
    .host('playback@dgx')
    .state({ process: 'fresh', compilerCache: 'reused', graph: 'warm_hit' })
    .expect(activation({ fusion: 'active' }), { arm: 'candidate', onMiss: 'invalid' })
    .gate(quality.ref('services/detection/benchmarks/grounding_dino_quality.py', { mode: 'exact' }))
    .repeat({ processes: 10, order: paired({ seed: 20261012 }) })
    .compare(stats.pairedRatio({ unit: 'process', ci: 0.95 }))
    .capture(capture.timing())
    .capture(capture.trace().ranges(RANGES).requests(12)))
  .derive('speedup', q.requests('dino-warm/*/timing'), rs => stats.pairedRatio({ unit: 'process', ci: 0.95 }).of(rs))
  .derive('kernels', q.kernels('dino-warm/*/trace').warm(), ks => ks
    .groupBy('arm', 'role').agg({ dur: ['count', 'sum', 'p50', 'max'] }).keep('max'))
  .derive('pairs',
    compare('dino-warm/baseline/trace', 'dino-warm/candidate/trace')
      .require('workload', 'boundary', 'fixtures', 'precision', 'host')
      .match(by.op()),
    m => m.pairs.map(p => ({ op: p.label, baseline: p.left.dur, candidate: p.right.dur, delta: p.delta })))
  .board('diff', b => {
    const request = b.param('request', slider({ min: 0, max: 11, step: 1 }).label('Request in trace').default(3));
    b.title('Baseline and candidate, side by side')
     .subtitle('Identity first, then the paired estimate, then the structural diff')
     .add(manifestDiff('dino-warm/baseline/trace#0', 'dino-warm/candidate/trace#0'))
     .add(row()
       .add(stat(live($ => $.read('speedup')), 'paired median latency ratio'))
       .add(stat(live($ => $.read('speedup').pairs.length), 'paired valid processes')))
     .add(math('\\hat r=\\operatorname*{median}_{p}\\;\\frac{\\tilde t^{\\,\\mathrm{cand}}_{p}}{\\tilde t^{\\,\\mathrm{base}}_{p}}', { caption: 'The paired estimate: $\\tilde t_p$ is the median latency of process $p$, and the bootstrap resamples **processes**, the independent unit — never correlated requests.' }))
     .add(mirror(compare('dino-warm/baseline/trace', 'dino-warm/candidate/trace').match(by.op()))
       .request(request).unmatched('show'))
     .add(chart(q.read('pairs')).mark('bar').x('op').y('delta', { unit: 'ms' }).sort('delta').title('Per-operation time, candidate − baseline'))
     .add(table(q.read('kernels')).cols('arm', 'role', 'dur.count', 'dur.sum', 'dur.p50', 'dur.max'));
  });
