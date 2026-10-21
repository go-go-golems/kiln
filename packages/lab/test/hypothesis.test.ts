// Hypothesis verdicts on @kiln/evidence's `verdict` (P-8): three-valued predicates, throwing predicates, missing
// inputs, invalid support. Each case states what Perf Lab's rule (HypothesisView.tsx L19-48) answered.
import { describe, expect, it } from 'vitest';
import { build, buildSynthetic, evaluateHypotheses, evaluateHypothesis, syntheticEnv, type HostReport, type RuntimeState } from '../src/index.ts';
import { readPreset } from '../src/node/index.ts';

const state: RuntimeState = { params: {}, signals: {} };

/** A program whose derive `rows` returns `rowsJs` and whose hypotheses are `hyps` (`.hypothesis(...)` calls). */
const program = (rowsJs: string, hyps: string) => `
return lab('h')
  .derive('rows', q.requests('nothing/*/timing'), () => ${rowsJs})
  .derive('broken', q.requests('nothing/*/timing'), () => { throw new Error('boom'); })
  ${hyps}
  .board('b', b => b.title('b'));`;

const judge = (rowsJs: string, predicate: string, query = "q.read('rows')") => {
  const out = build({ source: program(rowsJs, `.hypothesis('h', h => h.claim('c').predicts(${query}, ${predicate}))`), labId: 'h', params: {}, env: syntheticEnv(new Set()) });
  return evaluateHypothesis(out.registry, state, 'h');
};

const INTERVALS = {
  below: "[{ run: '#0', lo: 0.40, hi: 0.45 }, { run: '#1', lo: 0.41, hi: 0.47 }]",
  straddles: "[{ run: '#0', lo: 0.40, hi: 0.45 }, { run: '#1', lo: 0.46, hi: 0.53 }]",
  above: "[{ run: '#0', lo: 0.51, hi: 0.60 }, { run: '#1', lo: 0.46, hi: 0.53 }]",
};

describe('three-valued predicates (below/above)', () => {
  it('support a claim when every interval is on its side of the bound', () => {
    const v = judge(INTERVALS.below, 'r => below(r, 0.5)');
    expect(v.verdict).toBe('supported');
    expect(v.checks.map((c) => c.pass)).toEqual([true, true]);
  });

  it('leave it open when an interval straddles the bound, where a two-valued test refutes it', () => {
    const v = judge(INTERVALS.straddles, 'r => below(r, 0.5)');
    expect(v.verdict).toBe('open');
    expect(v.checks.map((c) => c.pass)).toEqual([true, null]);
    expect(v.reasons).toEqual(['row 1: the predicate returned a missing value']);
    expect(judge(INTERVALS.straddles, 'r => r.hi < 0.5').verdict).toBe('refuted');
  });

  it('refute it when one interval lies wholly on the other side, even if another straddles', () => {
    const v = judge(INTERVALS.above, 'r => below(r, 0.5)');
    expect(v.verdict).toBe('refuted');
    expect(v.checks.map((c) => c.pass)).toEqual([false, null]);
    expect(judge(INTERVALS.above, 'r => above(r, 0.5)').checks.map((c) => c.pass)).toEqual([true, null]);
  });
});

describe('what Perf Lab got wrong (P-8)', () => {
  it('a throwing predicate leaves its row undecided (Perf Lab: refuted)', () => {
    const v = judge("[{ x: 1 }, { x: 2 }]", 'r => { if (r.x === 2) throw new Error("no such field"); return true; }');
    expect(v.verdict).toBe('open');
    expect(v.checks[1]).toMatchObject({ pass: null, error: 'no such field' });
    expect(v.reasons).toEqual(['row 1: the predicate threw: no such field']);
  });

  it('a row whose predicate read a missing field neither supports nor refutes (Perf Lab: supported)', () => {
    const v = judge("[{ x: missing('not measured') }]", 'r => !(r.x > 1)');
    expect(v.verdict).toBe('open');
    expect(v.checks[0]).toMatchObject({ pass: null, missing: ['x'] });
    expect(v.reasons).toEqual(['row 0: missing x (not measured)']);
  });

  it('a missing field the predicate does not read does not hold the row open', () => {
    expect(judge("[{ x: 0.5, y: missing('n/a') }]", 'r => r.x < 1').verdict).toBe('supported');
  });

  it('a prediction query that fails is open with its error, not a thrown view', () => {
    const v = judge('[]', 'r => true', "q.read('broken')");
    expect(v.verdict).toBe('open');
    expect(v.error).toBe('the prediction query failed: boom');
  });

  it('no rows is open', () => {
    expect(judge('[]', 'r => true').reasons).toEqual(['no rows: nothing measured yet']);
  });
});

describe('support', () => {
  const LOCAL: HostReport = {
    host: 'mac',
    arch: 'arm64',
    cpu: { name: 'Test CPU', cores: 10, coreClasses: ['performance', 'efficiency'] },
    memoryBytes: null,
    gpu: { name: 'none', count: 0, precisions: [] },
    devices: ['cpu'],
    tools: { workloads: 'abc123def456' },
    threads: 8,
    counters: { unsupported: ['*'] },
    synthetic: false,
  };

  it('an invalid supporting run makes the verdict unqualified, naming the run and why', () => {
    // generated runs of the local sampler fail its activation rule, so its memory runs are invalid
    const { registry } = buildSynthetic(readPreset('local-sampler').source, { hosts: { [LOCAL.host]: LOCAL } });
    const v = evaluateHypothesis(registry, state, 'compile-removes-intermediate');
    expect(v.verdict).toBe('unqualified');
    expect(v.checks).toEqual([]);
    expect(v.support[0]!.invalid.length).toBeGreaterThan(0);
    expect(v.reasons[0]).toMatch(/^record sampler-loca: /);
  });

  it('every hypothesis of a build is judged, in declaration order', () => {
    const src = program('[{ x: 1 }]', ".hypothesis('a', h => h.claim('a').predicts(q.read('rows'), r => r.x === 1)).hypothesis('b', h => h.claim('b').predicts(q.read('rows'), r => r.x === 2))");
    const out = build({ source: src, labId: 'h', params: {}, env: syntheticEnv(new Set()) });
    expect(evaluateHypotheses(out.registry, state).map((v) => [v.id, v.verdict])).toEqual([['a', 'supported'], ['b', 'refuted']]);
    expect(() => evaluateHypothesis(out.registry, state, 'c')).toThrow(/unknown hypothesis "c"/);
  });
});
