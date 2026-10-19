// lab.js returns a lab builder. Every builder call becomes a node in the IR graph;
// nothing runs until a capture's plan is executed. Open GRAPH and PLAN in the inspector.
return lab('Hello, Perf Lab')
  .experiment('dino-warm', e => e
    .question('Does PR 1005 lower warm backend latency on the same work?')
    .workload(dino({ fixtures: 'coco-128', precision: 'fp16', inputSize: 768 }))
    .boundary('backend_cpu_result')
    .baseline(rev('a6f14d94'))
    .candidate(rev('d59d9ad0'))
    .capture(capture.timing()))
  // a derive is a data-time node: it runs over imported runs and is memoized on its inputs
  .derive('latency', q.requests('dino-warm/*/timing'), rs => rs
    .groupBy('arm')
    .agg({ latency: ['count', 'p50', 'p95', 'max'] }))
  .board('overview', b => b
    .title('Warm latency, baseline and candidate')
    .subtitle('Synthetic data · the console lists what this experiment is still missing')
    .add(table(q.read('latency')).cols('arm', 'latency.count', 'latency.p50', 'latency.p95', 'latency.max'))
    .add(chart(q.requests('dino-warm/*/timing'))
      .mark('point').x('t', { label: 'time in run', unit: 's' }).y('latency', { unit: 'ms' }).color('arm')));
