// Scenario A — DINO sampled intermediate (visualization contract, scenario A).
// Distinguish logical traffic, measured traffic and retained allocation; then state what the
// evidence does and does not establish about request latency.
const SAMPLER = src('d59d9ad0:services/detection/src/detection/backends/grounding_dino_fusion.py#_make_source');
const RANGES = ['decode', 'normalize', 'tokenize', 'layout_key', 'replay_submit', 'postprocess', 'cpu_result'];

// A component keeps its name in the IR, so selectors and the assistant can find it.
const KernelCard = component('KernelCard', ({ of }) => stack().gap(8).add(kernelCard(of)));

return lab('Scenario A · DINO sampled intermediate')
  .experiment('dino-sampler', e => e
    .question('Where did the sampled intermediate go, and does that explain the latency change?')
    .workload(dino({ fixtures: 'coco-128', precision: 'fp16', inputSize: 768 }))
    .boundary('backend_cpu_result')
    .baseline(rev('a6f14d94')).candidate(rev('d59d9ad0'))
    .host('playback@dgx')
    .state({ process: 'fresh', compilerCache: 'reused', graph: 'warm_hit' })
    .warmup(w => w.requests(16).until(activation({ replay: 'hit' })))
    .expect(activation({ fusion: 'active' }), { arm: 'candidate', onMiss: 'invalid' })
    .gate(quality.ref('services/detection/benchmarks/grounding_dino_quality.py', { mode: 'exact' }))
    .repeat({ processes: 8, order: paired({ seed: 20261012 }) })
    .compare(stats.pairedRatio({ unit: 'process', ci: 0.95 }))
    .capture(capture.timing())
    .capture(capture.trace().apis('cuda', 'nvtx').ranges(RANGES).requests(12))
    .capture(capture.memory().ledgers('tensor', 'allocator', 'traffic').around('replay'))
    .capture(capture.kernels()
      .launch(ctx => ctx.evidence('trace').kernels().role('encoder.sampling').warm().first())
      .sections('LaunchStats', 'Occupancy', 'MemoryWorkloadAnalysis')
      .cacheControl('all').replay('kernel')))
  .derive('speedup', q.requests('dino-sampler/*/timing'), rs => stats.pairedRatio({ unit: 'process', ci: 0.95 }).of(rs))
  .derive('intermediate', q.tensors('dino-sampler/*/memory').role('sampled_intermediate'), ts => ts.map(t => ({
    arm: t.run.split('/')[1],
    elements: t.numel,                                                          // 8·32·12240·16
    logicalBytes: t.numel * t.dtype.bytes,                                      // derived
    logicalTraffic: 2 * t.numel * t.dtype.bytes,                                // derived: write + reread, before caches
    measuredTraffic: t.back('writes', 'reads').metric('dram__bytes.sum').sum(), // observed per kernel, summed
    retained: t.follow('aliases').where(a => a.retainedBy).first()?.bytes ?? missing('block is not retained after the request'),
  })))
  .hypothesis('sampler-traffic', h => h
    .claim("Fusion removes the intermediate's global write and reread; the caller allocation is still retained.")
    .predicts(q.read('intermediate').where(r => r.arm === 'candidate'),
              r => r.measuredTraffic < r.logicalTraffic && r.retained > 0)
    .supportedBy(q.kernels('dino-sampler/*/kernels').role('encoder.sampling'), q.read('intermediate'))
    .alternatives(
      'The latency gain comes from replay, not fusion (no ablation in this bundle)',
      'Lower DRAM bytes reflect ncu cache control, not ordinary execution')
    .scope('kernel-level; does not by itself establish a request-latency improvement'))
  .board('identity', b => b
    .title('Is this a valid comparison?')
    .subtitle('Experiment identity first: a fast number with an unknown active path does not pass')
    .add(manifestDiff('dino-sampler/baseline/timing#0', 'dino-sampler/candidate/timing#0'))
    .add(row()
      .add(stat(live($ => $.read('speedup')), 'paired median latency ratio'))
      .add(stat(live($ => $.read('speedup').excluded.length), 'invalid processes excluded')))
    .add(runList('dino-sampler/*/timing')))
  .board('sampler', b => {
    const request = b.param('request', slider({ min: 0, max: 11, step: 1 }).label('Request').default(4));
    const sel = b.sig('sel', null);
    b.title('Where did the sampled intermediate go?')
     .subtitle('Logical traffic, measured traffic and retained allocation are three different facts')
     .add(mirror(compare('dino-sampler/baseline/trace', 'dino-sampler/candidate/trace').match(by.op()))
       .request(request).as('mirror').on('select', $ => $.set(sel, $.entity)))
     .add(math('8\\cdot 32\\cdot 12240\\cdot 16 = 50{,}135{,}040\\ \\text{FP32 elements} = 200{,}540{,}160\\ \\text{B}', { caption: 'Writing and rereading the sampled intermediate is about $401$ MB of **logical** traffic per occurrence — an algorithmic estimate; caches and the generated program decide the DRAM transactions.' }))
     .add(table(q.read('intermediate')).cols('arm', 'elements', 'logicalBytes', 'logicalTraffic', 'measuredTraffic', 'retained')
       .title('The sampled intermediate'))
     .add(split([1, 1])
       .left(KernelCard({ of: live($ => ($(sel)?.kind === 'kernel' ? $(sel) : null)) }))
       .right(stepper(algo.bilinear({ v: [[2, 6], [10, 14]], a: 0.25, b: 0.5 })).implements(SAMPLER)))
     .add(hypothesisCard('sampler-traffic'));
  })
  .board('memory', b => {
    const scope = b.param('scope', toggle(['allocator', 'process']).label('Ledger scope').default('allocator'));
    b.title('Memory ledgers')
     .subtitle('Allocator blocks and process accounting are separate scopes and are never summed')
     .add(ledger(live($ => q.allocs('dino-sampler/*/memory').where(a => a.scope === $(scope))))
       .groupBy('run').scope(scope));
  });
