// Parameters are declared, typed inputs. Each control shows its binding:
//   VIEW  — read only by live($ => …) lambdas: changes re-render immediately
//   DATA  — read by a derive: changes recompute the derived rows
//   PLAN  — read by a plan lambda (ctx => …): changes need new runs and become a pending plan
return lab('Parameters')
  .param('host', select(['playback@dgx', 'playback@rtx-dev']).label('Host').default('playback@dgx'))
  .experiment('dino-warm', e => e
    .param('processes', slider({ min: 2, max: 16, step: 1 }).label('Processes per arm').default(8)
      .confirm('Changes the experiment identity; new runs are needed.'))
    .param('precision', toggle(['fp16', 'fp32']).label('Precision').default('fp16'))
    .host(ctx => ctx.param('host'))
    .workload(dino({ fixtures: 'coco-128', precision: ctx => ctx.param('precision'), inputSize: 768 }))
    .boundary('backend_cpu_result')
    .baseline(rev('a6f14d94')).candidate(rev('d59d9ad0'))
    .expect(activation({ fusion: 'active' }), { arm: 'candidate', onMiss: 'invalid' })
    .gate(quality.ref('services/detection/benchmarks/grounding_dino_quality.py', { mode: 'exact' }))
    .repeat(ctx => ({ processes: ctx.param('processes'), order: paired({ seed: 20261012 }) }))
    .capture(capture.timing()))
  .derive('inWindow', q.requests('dino-warm/*/timing'), (rs, ctx) => {
    const [lo, hi] = ctx.param('window');            // a derive reads it, so `window` is DATA-bound
    return rs.where(r => r.batch >= lo && r.batch <= hi);
  })
  .derive('summary', q.read('inWindow'), rs => rs.groupBy('arm').agg({ latency: ['count', 'p50', 'p95', 'max'] }))
  .derive('speedup', q.read('inWindow'), rs => stats.pairedRatio({ unit: 'process', ci: 0.95 }).of(rs))
  .board('latency', b => {
    const window = b.param('window', range({ min: 0, max: 39, step: 1 }).label('Requests').unit('req').default([0, 39]));
    const quantile = b.param('quantile', toggle(['p50', 'p95', 'max']).label('Quantile').default('p95'));
    const arms = b.param('arms', multiselect(['baseline', 'candidate']).label('Arms').default(['baseline', 'candidate']));
    const showInvalid = b.param('showInvalid', checkbox().label('Include invalid processes').default(true));
    const scale = b.param('scale', radio([{ value: 'linear', label: 'Linear' }, { value: 'log', label: 'Log' }]).label('Y scale').default('linear'));
    const memo = b.param('memo', textInput({ placeholder: 'why this view?', maxLength: 80 }).label('Note').default(''));
    b.title('Parameters, three ways')
     .subtitle(live($ => `${$(quantile)} latency over requests ${$(window)[0]}–${$(window)[1]}`))
     .preset('tail', { quantile: 'max' })
     .preset('first ten', { window: [0, 9], quantile: 'p50' })
     .add(row()
       .add(stat(live($ => $.read('speedup')), 'paired median ratio'))
       .add(stat(live($ => $.read('speedup').excluded.length), 'processes excluded')))
     .add(chart(live($ => q.read('summary').where(r => $(arms).includes(r.arm))))
       .mark('bar').x('arm').y(live($ => `latency.${$(quantile)}`), { unit: 'ms' }).title('Quantile by arm'))
     .add(chart(live($ => q.read('inWindow').where(r => $(arms).includes(r.arm) && ($(showInvalid) || r.runValid))))
       .mark('point').x('batch', { label: 'request' }).y('latency', { unit: 'ms', scale: live($ => $(scale)) })
       .color('arm').shape('runValid').title('Every request in the window'))
     .add(text(live($ => ($(memo) ? `Note: ${$(memo)}` : ''))).color('muted'));
  });
