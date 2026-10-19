/** The vocabulary a program can use, as shown in the IDE's reference tab (see design/02 §4). */
export const REFERENCE: { title: string; lines: string[] }[] = [
  {
    title: 'Lambdas',
    lines: [
      'ctx => …           plan time: resolved once, baked into the IR (ctx.param, ctx.capabilities, ctx.adapter, ctx.evidence)',
      '(rows, ctx) => …   data time: derive callbacks over imported evidence, memoized on inputs',
      'live($ => …)       view time: re-runs when a parameter or signal it reads changes',
      ".on('select', $ => $.set(sig, $.row))   handler; $.set writes signals and parameters",
    ],
  },
  {
    title: 'Root',
    lines: [
      "lab(title).param(name, spec).experiment(id, e => …).derive(name, input, fn)",
      '  .hypothesis(id, h => …).board(id, b => …)',
      "rev(sha) · fixtures(id) · src('rev:path#symbol')",
    ],
  },
  {
    title: 'Experiment',
    lines: [
      'e.question · workload(dino({…}) | embedding({…})) · boundary · host · state',
      'e.baseline(rev) · candidate(rev) · arm(name, a => a.rev().switches().corunner().pin())',
      'e.warmup(w => w.requests(n).until(activation({…}))) · expect(activation({…}), { arm, onMiss })',
      'e.gate(quality.ref(path, opts)) · repeat({ processes, order: paired({ seed }) }) · compare(stats.pairedRatio({…}))',
      'e.capture(capture.timing() | trace() | kernels() | memory()) · phases(p => …) · offer(schedule.poisson({…}))',
      "e.matrix(axes, (e, cell) => …) · when(cond, e => e.limitation(text).skip()) · fork(id, e => …) · param(name, spec)",
    ],
  },
  {
    title: 'Parameters',
    lines: [
      'slider({min,max,step,unit,scale}) · range({…}) · number({…}) · checkbox() · toggle([…]) · select([…])',
      "multiselect([…]) · radio([…]) · textInput({placeholder, maxLength}) · seed() · pickRun('exp/*/trace')",
      '.label · .help · .default · .unit · .group · .when · .validate · .affects · .confirm · .url',
      'b.param(name, spec) → ParamRef · b.preset(name, values)',
      'binding = strongest reader: PLAN (ctx.param) > DATA (derive) > VIEW (live)',
    ],
  },
  {
    title: 'Evidence',
    lines: [
      "q.runs · requests · spans · kernels · tensors · allocs · instants · batches · graphs (pattern) · q.read(derive) · q.of(entity)",
      '.where(fn) .name(re) .kind(k) .role(r) .phase(p) .warm() .sort(k) .top(n,k) .first() .follow(rel) .back(rel)',
      '.groupBy(…).agg({ field: [count, p50, p95, max] }).keep(max) · .metric(name) · .sum()',
      "compare(a, b).require(...fields).match(by.op()) · stats.pairedRatio({unit}).of(rows) · stats.offered(rows)",
      'missing(reason) · illustrative(v) — missing is never zero',
    ],
  },
  {
    title: 'Views',
    lines: [
      'table(q).cols(…) · chart(q).mark(bar|point|line).x().y().color().shape().track().sort()',
      'timeline(run).lanes(…).window([s,e]).focus(entity) · mirror(compare(…)).request(i)',
      'stat(value, label) · manifest(run) · manifestDiff(a, b) · kernelCard(entity) · ledger(q).groupBy().scope()',
      'stepper(algo.bilinear|weightedReduction|rmsnorm|matmulTiles({…})) · route(query) · hypothesisCard(id)',
      'row() · stack() · grid(n) · grid`areas` · split([1,1]).left(v).right(v) · note(md) · text(t) · runList(pattern)',
      'math(tex, { caption }) · $inline TeX$ and **bold** in board titles, subtitles, notes, captions and stepper labels',
      "component(name, props => view) · defineKind(name, { defaults, describe, build })",
    ],
  },
  {
    title: 'Assistant handles (eval) — built into the workbench, not declared in lab.js',
    lines: [
      'lab.runs.find(pattern) · lab.run(ref) · lab.experiment(id).fork(id, e => …).plan() · lab.start(id, opts) → job',
      'run handle: ref · experiment · arm · mode · rep · host · synthetic · manifest · validity { ok, reasons[] } · activation · coverage · quality { status, … } · requests (rows; latency, cpuTime in ms) · kernels · instants (rusage: userTime, systemTime, maxRss, … as values) · entities(kind) · kernel({ role, name })',
      'rows: where(fn) · map(fn) · groupBy(...keys).agg({ field: ["count","p50","p95","max"] }) · sort(key) · top(n, key) · pluck(key) · length',
      "lab.derive(name) → rows of a declared derive · lab.query(q.requests('exp/*/timing').where(r => r.arm === 'candidate')) → rows; request fields: latency (ms), arm, rep, run",
      'job.status · await job.approved · for await (const ev of job.events) · await job.done',
      'lab.hypothesis(id).alternatives.add(text, { evidence, test }) · lab.params.set(key, v) · lab.checkpoint(label)',
      'self = the board in view: self.title · self.experiments (ids) · self.runs() (run handles) · self.params.<name> = v · self.state.<signal> = v · self.selected',
      'log(…) — observed values are read-only; runs need a person’s approval',
    ],
  },
];
