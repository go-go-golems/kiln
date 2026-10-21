// Two hosts — the local sampler experiment, once on the Mac and once on bling, read side by side.
// Each experiment is pinned to its host, so the plan sends one pair of perf-lab-sampler/1 jobs to each machine; the two
// run in parallel because jobs only queue behind other jobs on the same host. In the Lab view, Plan → Run.
const HOSTS = ['mac', 'bling'];
const WORKLOADS = src('HEAD:lab-workbench/workloads/perf_lab_local/sampler.py#unfused');
const PAIRED = stats.pairedRatio({ unit: 'process', ci: 0.95 });
const onHost = (h) => (r) => String(r.run).startsWith(`sampler-${h}/`);

const L = lab('Two hosts · the sampler on the Mac and on bling')
  .param('queries', select([1024, 2048, 4096]).label('Queries').default(2048));

const program = HOSTS.reduce((l, h) => l.experiment(`sampler-${h}`, e => e
  .question(`Does compiling the sampler change latency on ${h}?`)
  .host(h)
  .workload(sampler({ queries: ctx => ctx.param('queries'), heads: 8, channels: 32, points: 16, spatial: 64, device: 'cpu', dtype: 'float32' }))
  .boundary('sampler_output')
  .baseline(ctx => rev(ctx.capabilities.tools.workloads), a => a.switches({ impl: 'unfused' }))
  .candidate(ctx => rev(ctx.capabilities.tools.workloads), a => a.switches({ impl: 'compiled' }))
  .state({ process: 'fresh', compilerCache: 'reused' })
  .warmup(w => w.requests(4))
  .expect(activation({ compile: 'active' }), { arm: 'candidate', onMiss: 'invalid' })
  .gate(quality.ref('workloads/perf_lab_local/sampler.py#unfused', { mode: 'exact' }))
  .repeat({ processes: 6, order: paired({ seed: 20261020 }) })
  .compare(PAIRED)
  .capture(capture.timing())
  .capture(capture.cpu())), L);

return program
  .derive('speedup-mac', q.requests('sampler-mac/*/timing'), rs => PAIRED.of(rs))
  .derive('speedup-bling', q.requests('sampler-bling/*/timing'), rs => PAIRED.of(rs))
  // one row per host: the paired ratio and its interval as plain columns, so a table and a hypothesis can read them
  .derive('ratios', q.requests('sampler-*/*/timing'), rs => HOSTS.map(host => {
    const r = PAIRED.of(rs.where(onHost(host)));
    return { host, ratio: r.median, lo: r.ci[0], hi: r.ci[1], pairs: r.pairs.length, excluded: r.excluded.length };
  }))
  .derive('latency', q.requests('sampler-*/*/timing'), rs => HOSTS.flatMap(host =>
    [...rs.where(onHost(host)).groupBy('arm').agg({ latency: ['count', 'p50', 'p95', 'max'], cpuTime: ['p50'] })]
      .map(row => ({ host, ...row }))))
  .hypothesis('compile-slower-on-both', h => h
    .claim('On CPU, the TorchInductor-compiled sampler is slower than eager on both hosts: each host’s paired interval lies above 1×.')
    .predicts(q.read('ratios'), r => r.lo.value > 1)
    .supportedBy(q.requests('sampler-*/*/timing'), q.read('ratios'))
    .alternatives(
      'The slowdown is a property of one machine’s thread pool or memory system, not of the compiled code',
      'Six paired processes are too few on the noisier host for the interval to clear 1×')
    .scope('CPU float32 at the selected number of queries; one process per repetition; says nothing about GPU kernels'))
  .board('hosts', b => b
    .title('Same program, two machines')
    .subtitle('Each host runs its own paired experiment; ratios are compiled ÷ eager per process, never across hosts')
    .add(row()
      .add(stat(live($ => $.read('speedup-mac')), 'Mac · paired median latency ratio'))
      .add(stat(live($ => $.read('speedup-bling')), 'bling · paired median latency ratio')))
    .add(hypothesisCard('compile-slower-on-both'))
    .add(table(q.read('ratios')).cols('host', 'ratio', 'lo', 'hi', 'pairs', 'excluded').title('Paired ratio per host'))
    .add(chart(q.read('latency')).mark('bar').x('host').y('latency.p50', { unit: 'ms' }).color('arm').title('Median request latency by host and arm'))
    .add(table(q.read('latency')).cols('host', 'arm', 'latency.count', 'latency.p50', 'latency.p95', 'latency.max', 'cpuTime.p50')))
  .board('requests', b => b
    .title('Every request, per host')
    .subtitle('Latency against time in process; each point is one request at the sampler boundary')
    .add(row()
      .add(chart(q.requests('sampler-mac/*/timing')).mark('point').x('t', { label: 'time in process', unit: 's' }).y('latency', { unit: 'ms' }).color('arm').title('Mac'))
      .add(chart(q.requests('sampler-bling/*/timing')).mark('point').x('t', { label: 'time in process', unit: 's' }).y('latency', { unit: 'ms' }).color('arm').title('bling')))
    .add(runList('sampler-*/*/*')))
  .board('machines', b => b
    .title('What differs between the machines')
    .subtitle('The baseline manifests of the two hosts, then getrusage over each measured window')
    .add(manifestDiff('sampler-mac/baseline/timing#0', 'sampler-bling/baseline/timing#0'))
    .add(table(q.instants('sampler-*/*/cpu').where(i => i.type === 'rusage'))
      .cols('run', 'arm', 'userTime', 'systemTime', 'voluntaryCtxSwitches', 'involuntaryCtxSwitches', 'maxRss', 'window'))
    .add(source(WORKLOADS)));
