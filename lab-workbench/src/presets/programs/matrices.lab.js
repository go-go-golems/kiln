// matrix() expands an experiment at plan time. when() and skip() keep impossible cells visible
// with their reason. defineCollector() adds a capture mode: lower() runs at plan time for the runner.
const gpuClocks = defineCollector('gpu-clocks', {
  defaults: { every: '100ms' },
  describe: p => `nvidia-smi clocks, power and temperature every ${p.every}`,
  lower: p => ({
    argv: ['nvidia-smi', '--query-gpu=clocks.sm,clocks.mem,power.draw,temperature.gpu',
           '--format=csv,noheader,nounits', '-lms', String(ms(p.every))],
    artifact: 'gpu-clocks.csv',
  }),
});

const TREATMENTS = ['reference', 'norm+transfers', 'replay', 'replay+fusion', 'integrated'];

return lab('Matrices and plans')
  .experiment('dino-ablation', e => e
    .question('Which mechanism explains the integrated speedup?')
    .workload(dino({ fixtures: 'coco-128', precision: 'fp16', inputSize: 768 }))
    .boundary('backend_cpu_result')
    .host('playback@dgx')
    .gate(quality.ref('services/detection/benchmarks/grounding_dino_quality.py', { mode: 'exact' }))
    .expect(activation({ fusion: 'active' }), { arm: 'integrated', onMiss: 'invalid' })
    .repeat({ processes: 6, order: paired({ seed: 7 }) })
    .matrix({ treatment: TREATMENTS }, (e, cell) => e
      .arm(cell.treatment, a => a.rev('d59d9ad0').switches(ctx => ctx.adapter.switchesFor(cell.treatment)))
      .when(ctx => !ctx.adapter.supports(cell.treatment), e => e
        .limitation(`${cell.treatment}: no independent switch in the current implementation`)
        .skip()))
    .capture(capture.timing()))
  .experiment('dino-contention', e => e
    .question('How much does a co-runner slow the integrated path?')
    .workload(dino({ fixtures: 'coco-128', precision: 'fp16', inputSize: 768 }))
    .boundary('backend_cpu_result')
    .host('playback@dgx')
    .gate(quality.ref('services/detection/benchmarks/grounding_dino_quality.py', { mode: 'exact' }))
    .expect(activation({ fusion: 'active' }), { onMiss: 'invalid' })
    .repeat({ processes: 4, order: paired({ seed: 3 }) })
    .matrix({ corunner: [none(), stress.cpuBandwidth({ threads: 8 }), stress.gpuCompute({ sms: 0.5 })] }, (e, cell) => e
      .arm(cell.corunner.name, a => a.rev('d59d9ad0').corunner(cell.corunner).pin({ coreClass: 'performance' })))
    .capture(capture.timing(), gpuClocks({ every: '100ms' })))
  .derive('ablation', q.requests('dino-ablation/*/timing'), rs => rs.groupBy('arm').agg({ latency: ['count', 'p50', 'p95'] }))
  .derive('contention', q.requests('dino-contention/*/timing'), rs => rs.groupBy('arm').agg({ latency: ['count', 'p50', 'p95'] }))
  .board('cells', b => b
    .title('One contract, many cells')
    .subtitle('Open PLAN for stages, content hashes and the lowered perf_lab specifications')
    .add(note('The adapter has no independent switch for **replay** alone, so that cell is skipped and kept with its reason.'))
    .add(chart(q.read('ablation')).mark('bar').x('arm').y('latency.p50', { unit: 'ms' }).title('Ablation · p50 latency'))
    .add(table(q.read('ablation')).cols('arm', 'latency.count', 'latency.p50', 'latency.p95')))
  .board('contention', b => b
    .title('Controlled interference')
    .subtitle('One co-runner class per arm; clocks are recorded so throttling is not mistaken for bandwidth')
    .add(chart(q.read('contention')).mark('bar').x('arm').y('latency.p50', { unit: 'ms' }).title('p50 latency by co-runner'))
    .add(chart(q.instants('dino-contention/*/gpu-clocks').kind('gpu.clocks'))
      .mark('line').x('t', { unit: 's' }).y('sm', { unit: 'MHz' }).color('arm').title('SM clock')));
