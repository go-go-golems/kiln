// Local sampler — the first program whose evidence is measured, not generated.
// The experiment runs on a Kiln host (Host: the Mac or bling) as perf-lab-sampler/1 jobs in the perf-lab-cpu
// environment: one Python process per repetition, PyTorch's eager grid_sample against the same function compiled by
// TorchInductor. Nothing here exists until the plan runs; in the Lab view, Plan → Run (a few minutes).
const WORKLOADS = src('HEAD:ttmp/2026/10/12/ML-PERF-001--dino-and-embedding-kernel-profiling-and-visualization/experiments/lab-workbench/workloads/perf_lab_local/sampler.py#unfused');

const L = lab('Local · deformable sampling, measured')
  .param('queries', select([1024, 2048, 4096, 12240]).label('Queries').default(2048))
  .param('host', select(['mac', 'bling']).label('Host').default('mac'));
const queries = L.ref('queries');

return L
  .experiment('sampler-local', e => e
    .question('Does compiling the sampler change latency on this machine, and does the sampled intermediate disappear?')
    .host(ctx => ctx.param('host'))
    .workload(sampler({ queries: ctx => ctx.param('queries'), heads: 8, channels: 32, points: 16, spatial: 64, device: 'cpu', dtype: 'float32' }))
    .boundary('sampler_output')
    // the workload sources' content hash is part of each arm's identity: editing a script invalidates its runs
    .baseline(ctx => rev(ctx.capabilities.tools.workloads), a => a.switches({ impl: 'unfused' }))
    .candidate(ctx => rev(ctx.capabilities.tools.workloads), a => a.switches({ impl: 'compiled' }))
    .state({ process: 'fresh', compilerCache: 'reused' })
    .warmup(w => w.requests(4))
    .expect(activation({ compile: 'active' }), { arm: 'candidate', onMiss: 'invalid' })
    .gate(quality.ref('workloads/perf_lab_local/sampler.py#unfused', { mode: 'exact' }))
    .repeat({ processes: 4, order: paired({ seed: 20261012 }) })
    .compare(stats.pairedRatio({ unit: 'process', ci: 0.95 }))
    .capture(capture.timing())
    .capture(capture.trace().requests(4).processes(1))
    .capture(capture.memory())
    .capture(capture.cpu()))
  .derive('latency', q.requests('sampler-local/*/timing'), rs => rs.groupBy('arm').agg({ latency: ['count', 'p50', 'p95', 'max'], cpuTime: ['p50'] }))
  .derive('speedup', q.requests('sampler-local/*/timing'), rs => stats.pairedRatio({ unit: 'process', ci: 0.95 }).of(rs))
  // allocator blocks of the first profiled request, per arm; an arm without a memory run has no row
  .derive('blocks', q.allocs('sampler-local/*/memory'), (as, ctx) => {
    const intermediate = 8 * 32 * ctx.param('queries') * 16 * 4;
    const arms = [...new Set(as.map(a => a.arm))];
    return arms.map(arm => {
      const first = as.where(a => a.arm === arm && String(a.request).endsWith('-000'));
      return {
        arm,
        blocks: first.length,
        intermediateSized: first.where(a => a.bytes >= intermediate).length,
        largest: Math.max(...first.map(a => a.bytes)),
        allocatedIn: [...new Set(first.where(a => a.bytes >= intermediate).map(a => a.allocatedIn))].join(', '),
      };
    });
  })
  .hypothesis('compile-removes-intermediate', h => h
    .claim('Compiling the sampler removes the sampled intermediate: the compiled arm allocates no intermediate-sized block.')
    .predicts(q.read('blocks').where(r => r.arm === 'candidate'), r => r.intermediateSized === 0)
    .supportedBy(q.allocs('sampler-local/*/memory'), q.read('blocks'))
    .alternatives(
      'TorchInductor keeps grid_sampler_2d as a separate kernel on CPU and fuses only the multiply and reduction',
      'The block is the output or a workspace, not the intermediate (sizes coincide only at these shapes)')
    .scope('allocator evidence for one request per arm on this host; says nothing about GPU fusion'))
  .board('identity', b => b
    .title('Is this a valid comparison?')
    .subtitle('Measured on a Kiln host: identity, activation and the quality gate come first')
    .add(manifestDiff('sampler-local/baseline/timing#0', 'sampler-local/candidate/timing#0'))
    .add(row()
      .add(stat(live($ => $.read('speedup')), 'paired median latency ratio, compiled ÷ eager'))
      .add(stat(live($ => $.read('speedup').excluded.length), 'invalid processes excluded')))
    .add(runList('sampler-local/*/*')))
  .board('latency', b => {
    const quantile = b.param('quantile', toggle(['p50', 'p95', 'max']).label('Quantile').default('p50'));
    b.title('Per-request latency at the sampler boundary')
     .subtitle('Each process is a repetition; the estimator pairs processes, never requests')
     .add(chart(q.read('latency')).mark('bar').x('arm').y(live($ => `latency.${$(quantile)}`), { unit: 'ms' }).title('Latency by arm'))
     .add(chart(q.requests('sampler-local/*/timing')).mark('point').x('t', { label: 'time in process', unit: 's' }).y('latency', { unit: 'ms' }).color('arm'))
     .add(table(q.read('latency')).cols('arm', 'latency.count', 'latency.p50', 'latency.p95', 'latency.max', 'cpuTime.p50'));
  })
  .board('memory', b => {
    const run = b.param('run', pickRun('sampler-local/*/trace').label('Trace run').default('sampler-local/candidate/trace#0'));
    b.title('Where does the sampled intermediate go?')
     .subtitle('Allocator events from torch.profiler, attributed to the operator that was running')
     .add(math(live($ => `8 \\cdot 32 \\cdot ${$(queries)} \\cdot 16 \\cdot 4\\ \\text{B} = ${(8 * 32 * $(queries) * 16 * 4 / 2 ** 20).toFixed(0)}\\ \\text{MiB}`), {
       caption: 'Size of the $[B{\\cdot}H, C, Q, P]$ intermediate in **float32** for the selected number of queries.',
     }))
     .add(table(q.read('blocks')).cols('arm', 'blocks', 'intermediateSized', 'largest', 'allocatedIn').title('First request, per arm'))
     .add(hypothesisCard('compile-removes-intermediate'))
     .add(timeline(run).lanes('cpu:main'))
     .add(table(q.allocs('sampler-local/*/memory').where(a => a.bytes >= 1 << 20)).cols('arm', 'name', 'range', 'bytes', 'lifetime').title('Blocks of 1 MiB or more'));
  })
  .board('cpu', b => b
    .title('What the process did with the CPU')
    .subtitle('getrusage over the measured window; scope is the whole process, all threads')
    .add(table(q.instants('sampler-local/*/cpu').where(i => i.type === 'rusage'))
      .cols('arm', 'userTime', 'systemTime', 'voluntaryCtxSwitches', 'involuntaryCtxSwitches', 'minorFaults', 'maxRss', 'window'))
    .add(source(WORKLOADS)));
