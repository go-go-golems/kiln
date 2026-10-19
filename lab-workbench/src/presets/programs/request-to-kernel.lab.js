// Queries are lazy nodes. A route follows typed relationships and reports each hop's evidence class.
const RANGES = ['decode', 'normalize', 'tokenize', 'layout_key', 'replay_submit', 'postprocess', 'cpu_result'];

return lab('Request to kernel')
  .experiment('dino-warm', e => e
    .workload(dino({ fixtures: 'coco-128', precision: 'fp16', inputSize: 768 }))
    .boundary('backend_cpu_result')
    .baseline(rev('a6f14d94')).candidate(rev('d59d9ad0'))
    .host('playback@dgx')
    .expect(activation({ fusion: 'active' }), { arm: 'candidate', onMiss: 'invalid' })
    .gate(quality.ref('services/detection/benchmarks/grounding_dino_quality.py', { mode: 'exact' }))
    .repeat({ processes: 8, order: paired({ seed: 20261012 }) })
    .capture(capture.trace().apis('cuda', 'nvtx', 'osrt').ranges(RANGES).requests(12))
    // which launch to profile comes from the trace, so this capture is staged after the trace import
    .capture(capture.kernels()
      .launch(ctx => ctx.evidence('trace').kernels().role('encoder.sampling').warm().first())
      .sections('LaunchStats', 'Occupancy', 'MemoryWorkloadAnalysis', 'WarpStateStats')
      .cacheControl('all').replay('kernel')))
  .board('explore', b => {
    const run = b.param('run', pickRun('dino-warm/*/trace').label('Trace run').default('dino-warm/candidate/trace#0'));
    const sel = b.sig('sel', null);
    b.title('Follow one request to its kernel')
     .subtitle('Select a request or a kernel; the route, the counters and the inspector follow')
     .layout(grid`
        requests  timeline
        kernel    route`)
     .add(table(live($ => q.requests($(run)).sort('-latency'))).cols('id', 'latency', 'outcome', 'warm').as('requests')
       .on('select', $ => $.set(sel, $.row)))
     .add(timeline(run).lanes('cpu:main', 'cuda:stream 7', 'cuda:copy').focus(sel).as('timeline')
       .on('select', $ => $.set(sel, $.entity)))
     .add(kernelCard(live($ => ($(sel)?.kind === 'kernel' ? $(sel) : null))).as('kernel'))
     .add(route(live($ => {
       const s = $(sel);
       const start = s?.kind === 'request' ? q.of(s) : q.requests($(run)).top(1, 'latency');
       return start.follow('contains').follow('launches').role('encoder.sampling').follow('compiled_from').follow('implements');
     })).as('route'));
  });
