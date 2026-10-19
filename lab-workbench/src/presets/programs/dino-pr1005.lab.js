// PR 1005 — Grounding DINO acceleration, studied from its DGX qualification evidence (ML-PERF-002).
// The evidence was produced on playback@dgx by the PR's own benchmark and the 2026-10-12 reproduction, and
// archived as one .tar.gz. Register it once (pnpm lab evidence add <archive>), fetch the dataset's images
// (pnpm lab datasets materialize c435d426e9d2), then open PLAN and import.
const DS = dataset('c435d426e9d2d44aff1fcdc457b1705612eca0bfa17c7aed4efbf035114df74c', { name: 'COCO val2017 selection, seed 20261009' });
const DGX = archive('0daa394d641cfbec091824be41eb153dcc367ca9038d038ca7ee395926ef20c3', { name: 'pr1005-dgx-20261012' });
const LABELS = ['person', 'car', 'truck', 'chair', 'dog'];
const REPLAY = src('d59d9ad0:services/detection/src/detection/backends/grounding_dino_replay.py#ReplayModel.run');
const ACCEPT = src('d59d9ad0:services/detection/benchmarks/grounding_dino_acceptance.py#check_acceptance');

// medians and a deterministic image-cluster bootstrap of the reduction 1 − median(candidate) / median(baseline)
const median = xs => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : NaN; };
const bootstrap = (byImage, draws, seed) => {
  let x = seed >>> 0;
  const next = () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const keys = [...byImage.keys()];
  const out = [];
  for (let d = 0; d < draws; d++) {
    const b = [], c = [];
    for (let i = 0; i < keys.length; i++) { const v = byImage.get(keys[Math.floor(next() * keys.length)]); b.push(...v.baseline); c.push(...v.candidate); }
    out.push(1 - median(c) / median(b));
  }
  out.sort((a, b) => a - b);
  return [out[Math.floor(draws * 0.025)], out[Math.floor(draws * 0.975)]];
};
const POOLS = { rss: 'process RSS', cudaAllocated: 'CUDA allocated', cudaReserved: 'CUDA reserved', cgroup: 'container cgroup' };

const L = lab('PR 1005 · Grounding DINO acceleration on the DGX')
  .param('image', select(ctx => (ctx.dataset(DS)?.images ?? [{ imageId: 1993 }]).map(i => i.imageId)).label('Image').default(1993))
  // which images the local CPU run uses: a plan parameter, so each choice is its own pair of captures
  .param('localImages', select(['stratified', 'negatives', 4, 'all']).label('Local images').default('stratified'));
const image = L.ref('image');

return L
  .experiment('pr1005-dgx', e => e
    .question('Does the PR halve median latency on the DGX with outputs exactly unchanged and every memory pool within 20 %?')
    .host('playback@dgx')
    .workload(dino({ dataset: DS, images: 'all', labels: LABELS, precision: 'fp16', inputSize: 768, boxThreshold: 0.3, textThreshold: 0.3 }))
    .boundary('detect_with_options')
    .baseline(rev('a6f14d947'))
    .candidate(rev('d59d9ad'))
    .expect(activation({ replay: 'active' }), { arm: 'candidate', onMiss: 'invalid' })
    .gate(quality.exact())
    .repeat({ processes: 2, order: paired({ seed: 20261009 }) })
    .evidence(DGX, { format: 'detection-qualification/v1' })
    .capture(capture.timing())
    .capture(capture.memory().states(['cold', 'warm', 'warm-repeat']))
    .capture(capture.stages())
    .capture(capture.predictions())
    .capture(capture.kernels())
    .capture(capture.tests())
    .limitation('one GB10 host shared with running services; the 128-image fixture is a reconstruction (799 annotations), not the PR’s original subset (734)')
    .limitation('the paired report keeps output digests, not detections; full predictions exist for 16 images'))
  .experiment('pr1005-prompt-policy', e => e
    .question('Does keying the replay graph on tensor layout, not prompt text, avoid recapture when equal-length prompts alternate?')
    .host('playback@dgx')
    .workload(dino({ dataset: DS, images: [1993, 7088, 16249, 25393], labels: LABELS, precision: 'fp16', inputSize: 768 }))
    .boundary('detect_with_options')
    .baseline(rev('d59d9ad'), a => a.switches({ variant: 'prompt-keyed', replayKey: 'layout + prompt text' }))
    .candidate(rev('d59d9ad'), a => a.switches({ variant: 'reuse', replayKey: 'layout' }))
    .expect(activation({ replay: 'active' }), { arm: 'candidate', onMiss: 'invalid' })
    .gate(quality.exact())
    .evidence(DGX, { format: 'detection-qualification/v1', reports: { timing: ['changing-prompt-diagnostic.json'] } })
    .repeat({ processes: 1 })
    .capture(capture.timing())
    .limitation('a controlled modification of the final stack, not the historical first-round implementation'))

  .experiment('dino-local', e => e
    .question('On this CPU, do the two changes that run without CUDA — the normalization table and bulk postprocessing — keep outputs exact, and what do they cost here?')
    .host('local')
    .workload(dino({ dataset: DS, images: ctx => ctx.param('localImages'), labels: LABELS, precision: 'fp32', inputSize: 768, boxThreshold: 0.3, textThreshold: 0.3 }))
    .boundary('detect_with_options')
    .baseline(rev('a6f14d947'))
    .candidate(rev('d59d9ad'))
    .expect(activation({ replay: 'not configured' }), { arm: 'candidate', onMiss: 'invalid' })
    .gate(quality.exact())
    .warmup(w => w.requests(1))
    .repeat({ processes: 1, order: paired({ seed: 20261009 }) })
    .capture(capture.timing().pairs(2))
    .capture(capture.predictions())
    .limitation('CPU float32 with torch 2.14.1: replay and fusion need CUDA and are not configured, so this run says nothing about them')
    .limitation('needs the model snapshot (pnpm lab models fetch) and the dataset images (pnpm lab datasets materialize c435d426e9d2)'))

  .derive('localLatency', q.requests('dino-local/*/timing'), rs =>
    ['baseline', 'candidate'].map(arm => {
      const mine = rs.where(r => r.arm === arm);
      if (!mine.length) return { arm, requests: 0, p50: missing('no local timing run yet: run the plan'), allExact: missing('no local timing run yet: run the plan') };
      return { arm, requests: mine.length, p50: median(mine.map(r => r.latency)), allExact: rs.every(r => r.exact === true) };
    }))
  .derive('localPerImage', q.requests('dino-local/*/timing'), rs => {
    const by = new Map();
    for (const r of rs) {
      const v = by.get(r.image) ?? { image: r.image, baseline: [], candidate: [] };
      v[r.arm].push(r.latency);
      by.set(r.image, v);
    }
    return [...by.values()].map(v => ({ image: v.image, baselineMs: median(v.baseline), candidateMs: median(v.candidate), saved: median(v.baseline) - median(v.candidate) }));
  })
  .derive('latency', q.requests('pr1005-dgx/*/timing'), rs => {
    const reps = [...new Set(rs.map(r => r.rep))].sort();
    const row = (label, sel) => {
      const b = rs.where(r => r.arm === 'baseline' && sel(r)).map(r => r.latency);
      const c = rs.where(r => r.arm === 'candidate' && sel(r)).map(r => r.latency);
      if (!c.length || !b.length) return { run: label, pairs: 0, baselineP50: missing('no paired timing imported'), candidateP50: missing('no paired timing imported'), reduction: missing('no paired timing imported'), allExact: missing('no paired timing imported') };
      return { run: label, pairs: c.length, baselineP50: median(b), candidateP50: median(c), reduction: 1 - median(c) / median(b), allExact: rs.where(sel).every(r => r.exact === true) };
    };
    return [...reps.map(rep => row(`#${rep}`, r => r.rep === rep)), row('both', () => true)];
  })
  .derive('reductionCI', q.requests('pr1005-dgx/*/timing'), rs => {
    return [...new Set(rs.map(r => r.rep))].sort().map(rep => {
      const byImage = new Map();
      for (const r of rs.where(x => x.rep === rep)) {
        const v = byImage.get(r.image) ?? { baseline: [], candidate: [] };
        v[r.arm].push(r.latency);
        byImage.set(r.image, v);
      }
      const [lo, hi] = bootstrap(byImage, 2000, 20261012 + rep);
      return { run: `#${rep}`, images: byImage.size, lo, hi };
    });
  })
  .derive('perImage', q.requests('pr1005-dgx/*/timing'), rs => {
    const by = new Map();
    for (const r of rs.where(x => x.rep === 0)) {
      const v = by.get(r.image) ?? { image: r.image, baseline: [], candidate: [] };
      v[r.arm].push(r.latency);
      by.set(r.image, v);
    }
    return [...by.values()].map(v => ({ image: v.image, baselineMs: median(v.baseline), candidateMs: median(v.candidate), ratio: median(v.candidate) / median(v.baseline) }));
  })
  .derive('memoryGrowth', q.instants('pr1005-dgx/*/memory').where(i => i.type === 'memory.peaks'), is => {
    const rows = [];
    for (const state of ['cold', 'warm', 'warm-repeat'])
      for (const [pool, name] of Object.entries(POOLS)) {
        const b = is.find(i => i.arm === 'baseline' && i.state === state);
        const c = is.find(i => i.arm === 'candidate' && i.state === state);
        if (!b || !c) continue;
        const bv = Number(b[pool]), cv = Number(c[pool]);
        rows.push({ state, pool: name, baselineMiB: bv / 2 ** 20, candidateMiB: cv / 2 ** 20, ratio: cv / bv, growth: cv / bv - 1 });
      }
    return rows;
  })
  .derive('stageCost', q.spans('pr1005-dgx/*/stages'), ss =>
    [...new Set(ss.map(s => s.name))].flatMap(name => ['baseline', 'candidate'].map(arm => ({ stage: name, arm, p50: median(ss.where(s => s.name === name && s.arm === arm).map(s => s.dur)) }))))
  .derive('promptPolicy', q.requests('pr1005-prompt-policy/*/timing'), rs =>
    ['baseline', 'candidate'].map(arm => {
      const mine = rs.where(r => r.arm === arm);
      if (!mine.length) return { arm, replayKey: arm === 'candidate' ? 'layout' : 'layout + prompt text', requests: 0, p50: missing('not imported'), captures: missing('not imported'), allExact: missing('not imported') };
      return { arm, replayKey: arm === 'candidate' ? 'layout' : 'layout + prompt text', requests: mine.length, p50: median(mine.map(r => r.latency)), captures: mine.reduce((a, r) => a + (r.captures ?? 0), 0), allExact: mine.every(r => r.exact === true) };
    }))

  .hypothesis('outputs-exact', h => h
    .claim('Every paired output of the candidate is bitwise identical to the original backend’s.')
    .predicts(q.read('latency').where(r => r.run === 'both'), r => r.allExact === true)
    .supportedBy(q.requests('pr1005-dgx/*/timing'))
    .scope('256 pairs per run on 128 COCO images, FP16, five labels; digests compare labels, order, confidences and boxes'))
  .hypothesis('latency-halved', h => h
    .claim('The candidate’s median latency is at most half the original’s (the PR’s acceptance rule).')
    .predicts(q.read('latency').where(r => r.run !== 'both'), r => r.reduction >= 0.5)
    .supportedBy(q.requests('pr1005-dgx/*/timing'))
    .alternatives(
      'Co-resident services on the DGX slow both arms and compress the ratio (GPU load was recorded but not controlled)',
      'The model forward still dominates: the fused sampler is ~12 % of candidate CUDA time, matrix kernels the rest')
    .scope('whole-path backend latency on this host; excludes HTTP, decode outside the backend, model load and capture'))
  .hypothesis('memory-within-20', h => h
    .claim('Every memory pool of a fresh candidate process stays within 1.2 × the original’s, cold and warm.')
    .predicts(q.read('memoryGrowth'), r => r.ratio <= 1.2)
    .supportedBy(q.instants('pr1005-dgx/*/memory'))
    .alternatives('The warm cgroup excess is charged file cache or compiler children, not resident model memory (memory.stat was not sampled)')
    .scope('single fresh-process observations per state; pools measure different things and are never added'))
  .hypothesis('prompt-reuse', h => h
    .claim('Keying the graph on layout lets equal-length prompts reuse one capture: zero captures while timing, and a lower median.')
    .predicts(q.read('promptPolicy').where(r => r.arm === 'candidate'), r => r.captures === 0 && r.allExact === true)
    .supportedBy(q.requests('pr1005-prompt-policy/*/timing'))
    .scope('four images × five single-label prompts; prompts of different token length were not alternated'))
  .hypothesis('cpu-parts-preserve', h => h
    .claim('On this CPU the candidate’s outputs are bitwise identical to the original’s: the table and the bulk transfers change no decision.')
    .predicts(q.read('localLatency').where(r => r.arm === 'candidate'), r => r.allExact === true)
    .supportedBy(q.requests('dino-local/*/timing'))
    .scope('the selected local images, FP32 on CPU, one process; replay and fusion are not part of this claim'))
  .hypothesis('fusion-active', h => h
    .claim('The audited fused sampler runs in the candidate: the profile contains fused_sampling launches.')
    .predicts(q.kernels('pr1005-dgx/candidate/kernels').where(k => k.name === 'fused_sampling'), k => k.calls > 0)
    .supportedBy(q.checks('pr1005-dgx/candidate/tests'))
    .scope('three warm profiled calls; the native suite asserts fusion separately (39 tests)'))

  .board('identity', b => b
    .title('Is this the PR’s configuration?')
    .subtitle('Revisions, toolchain, model and image digest of the paired runs; the native suite and activation come first')
    .add(manifestDiff('pr1005-dgx/baseline/timing#0', 'pr1005-dgx/candidate/timing#0'))
    .add(row()
      .add(hypothesisCard('outputs-exact'))
      .add(hypothesisCard('fusion-active')))
    .add(table(q.checks('pr1005-dgx/candidate/tests')).cols('name', 'outcome', 'seconds').title('Native upgrade suite (--gdino-upgrade)'))
    .add(runList('pr1005-dgx/*/*')))
  .board('latency', b => b
    .title('Did the PR halve latency on the DGX?')
    .subtitle('Whole-path backend latency, two randomized pairs per image, both runs')
    .add(row()
      .add(stat(live($ => $.read('latency').find(r => r.run === 'both')?.reduction), 'median reduction, both runs (≥ 0.5 required)'))
      .add(stat(live($ => $.read('latency').find(r => r.run === 'both')?.candidateP50), 'candidate median, ms'))
      .add(stat(live($ => $.read('latency').find(r => r.run === 'both')?.baselineP50), 'original median, ms')))
    .add(table(q.read('latency')).cols('run', 'pairs', 'baselineP50', 'candidateP50', 'reduction', 'allExact').title('Acceptance rule per run'))
    .add(table(q.read('reductionCI')).cols('run', 'images', 'lo', 'hi').title('Image-cluster bootstrap, 95 % interval of the reduction'))
    .add(chart(q.read('perImage')).mark('point').x('baselineMs', { label: 'original median', unit: 'ms' }).y('candidateMs', { label: 'candidate median', unit: 'ms' }).title('Per image (run #0): points below 0.5 × would meet the rule'))
    .add(hypothesisCard('latency-halved'))
    .add(source(ACCEPT)))
  .board('stages', b => b
    .title('Where did the time go?')
    .subtitle('Synchronized stage boundaries on 16 images; descriptive localization, not one-change-at-a-time ablation')
    .add(chart(q.read('stageCost')).mark('bar').x('stage').y('p50', { unit: 'ms' }).color('arm').title('Median per stage'))
    .add(table(q.read('stageCost')).cols('stage', 'arm', 'p50'))
    .add(table(q.kernels('pr1005-dgx/candidate/kernels').where(k => k.selfCuda > 2)).cols('name', 'role', 'calls', 'selfCuda', 'selfCudaPct', 'avgCuda').title('Candidate CUDA kernels above 2 ms (three warm calls)')))
  .board('memory', b => {
    const pool = b.param('pool', toggle(Object.values(POOLS)).label('Pool').default('container cgroup'));
    b.title('Memory, one pool at a time')
     .subtitle('Fresh processes per state; the pools measure different things and are never added (GB10 memory is unified)')
     .add(chart(live($ => { const p = $(pool); return q.read('memoryGrowth').where(r => r.pool === p); })).mark('bar').x('state').y('growth', { label: 'growth over the original' }).title('Candidate growth per state (the rule allows 0.2)'))
     .add(table(q.read('memoryGrowth')).cols('state', 'pool', 'baselineMiB', 'candidateMiB', 'growth'))
     .add(hypothesisCard('memory-within-20'));
  })
  .board('prompts', b => b
    .title('Does the graph survive a prompt change?')
    .subtitle('Equal-length single-label prompts cycling over four images; the only difference is the replay key')
    .add(table(q.read('promptPolicy')).cols('arm', 'replayKey', 'requests', 'p50', 'captures', 'allExact'))
    .add(chart(q.requests('pr1005-prompt-policy/*/timing')).mark('point').x('seq', { label: 'request' }).y('latency', { unit: 'ms' }).color('arm'))
    .add(hypothesisCard('prompt-reuse'))
    .add(source(REPLAY)))
  .board('detections', b => b
    .title('What did each arm detect?')
    .subtitle('Ground truth dashed, original thick, candidate thin; predictions exist for 16 images, the rest are digest-only')
    .add(gallery(q.images(DS)).runs('pr1005-dgx/*/predictions').selected(image).title('COCO selection (choose an image)')
      .on('select', $ => $.set(image, $.entity.imageId)))
    .add(detections(DS, image).runs('pr1005-dgx/*/predictions')))
  .board('local', b => b
    .title('This CPU: the two changes that run without CUDA')
    .subtitle('Playback’s backend at a6f14d947 and d59d9ad, paired in one process on this machine, on the images chosen above')
    .add(table(q.read('localLatency')).cols('arm', 'requests', 'p50', 'allExact').title('Latency on this CPU'))
    .add(chart(q.read('localPerImage')).mark('bar').x('image').y('saved', { unit: 'ms' }).title('Median saved per image, original − candidate'))
    .add(hypothesisCard('cpu-parts-preserve'))
    .add(gallery(q.images(DS)).runs('dino-local/*/predictions').filter('recorded').selected(image).title('Images of the local run')
      .on('select', $ => $.set(image, $.entity.imageId)))
    .add(detections(DS, image).runs('dino-local/*/predictions'))
    .add(detections(DS, image).runs('*/candidate/predictions').title('The candidate on the DGX GPU (FP16) and on this CPU (FP32)')));
