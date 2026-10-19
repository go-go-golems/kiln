// The estimators on @kiln/evidence: stats.pairedRatio, stats.offered, stats.summary and the row aggregates.
import { median, pairedRatio as evidencePairedRatio } from '@kiln/evidence';
import { describe, expect, it } from 'vitest';
import { derived, illustrative, isValue, missing, observed, rows, seedFrom, stats, type Value } from '../src/index.ts';

type Row = Record<string, unknown>;

/** Requests of `reps` paired processes: baseline latencies around `b`, candidate around `b * ratio`. */
function requests(reps: number, ratios: number[], opts: { arms?: [string, string]; perRep?: number } = {}): Row[] {
  const [ab, ac] = opts.arms ?? ['baseline', 'candidate'];
  const out: Row[] = [];
  for (let rep = 0; rep < reps; rep++) {
    for (let i = 0; i < (opts.perRep ?? 5); i++) {
      const base = 10 + rep * 0.1 + i * 0.01;
      out.push({ arm: ab, rep, latency: base, outcome: 'ok', runValid: true });
      out.push({ arm: ac, rep, latency: base * ratios[rep % ratios.length]!, outcome: 'ok', runValid: true });
    }
  }
  return out;
}

const RATIOS = [0.5, 0.55, 0.6, 0.52, 0.58, 0.61, 0.49];

describe('stats.pairedRatio', () => {
  it('pairs per-repetition medians and takes its interval from evidence, with Perf Lab’s seed by default', () => {
    const rs = requests(7, RATIOS);
    const est = stats.pairedRatio({ unit: 'process', ci: 0.95 }).of(rs);
    expect(est.pairs).toHaveLength(7);
    const seed = seedFrom(`pairedRatio:${est.pairs.map((p) => p.ratio).join(',')}`);
    const ev = evidencePairedRatio(est.pairs.map((p) => ({ rep: p.rep, a: p.baseline, b: p.candidate })), { level: 0.95, seed });
    expect(est.seed).toBe(seed);
    expect(est.median.value).toBe(ev.median);
    expect([est.ci[0].value, est.ci[1].value]).toEqual(ev.ci);
    expect(est.median.ci).toEqual(ev.ci);
    expect(est.median.n).toBe(7);
    expect(est.median.prov).toBe('derived');
    expect(est.caveat).toBeNull();
    // per-repetition medians are evidence's median
    const b0 = rs.filter((r) => r.arm === 'baseline' && r.rep === 0).map((r) => r.latency as number);
    expect(est.pairs[0]!.baseline).toBe(median(b0));
  });

  it('honours an explicit seed (P-9)', () => {
    const rs = requests(7, RATIOS);
    for (const seed of [7, 'kiln']) {
      const est = stats.pairedRatio({ seed }).of(rs);
      const ev = evidencePairedRatio(est.pairs.map((p) => ({ rep: p.rep, a: p.baseline, b: p.candidate })), { seed });
      expect(est.seed).toBe(seed);
      expect([est.ci[0].value, est.ci[1].value]).toEqual(ev.ci);
    }
    const a = stats.pairedRatio({ seed: 1 }).of(rs);
    const b = stats.pairedRatio({ seed: 1 }).of(rs);
    expect(a.ci.map((v) => v.value)).toEqual(b.ci.map((v) => v.value));
  });

  it('pairs arms by the names it is given (P-9)', () => {
    const rs = requests(6, RATIOS, { arms: ['eager', 'compiled'] });
    expect(stats.pairedRatio().of(rs).median.value).toBeNull();
    const est = stats.pairedRatio({ baseline: 'eager', candidate: 'compiled' }).of(rs);
    expect(est.pairs).toHaveLength(6);
    expect(est.median.value).toBeCloseTo(0.565, 12);
  });

  it('reports the small-sample caveat (P-15)', () => {
    const est = stats.pairedRatio().of(requests(4, RATIOS));
    expect(est.caveat).toBe('n = 4: the interval is bounded by the sample range');
    const ratios = est.pairs.map((p) => p.ratio);
    expect(est.ci[0].value).toBeGreaterThanOrEqual(Math.min(...ratios));
    expect(est.ci[1].value).toBeLessThanOrEqual(Math.max(...ratios));
  });

  it('excludes invalid processes and pairs evidence refuses, and says so', () => {
    const rs = requests(6, RATIOS);
    for (const r of rs) if (r.rep === 2 && r.arm === 'candidate') Object.assign(r, { runValid: false, invalidReason: 'fusion fell back' });
    for (const r of rs) if (r.rep === 4) r.latency = r.arm === 'baseline' ? -1 : r.latency;
    const est = stats.pairedRatio().of(rs);
    expect(est.excluded).toEqual([
      { rep: 2, arm: 'candidate', reason: 'fusion fell back' },
      { rep: 4, arm: 'candidate/baseline', reason: expect.stringMatching(/finite and positive/) },
    ]);
    expect(est.n).toBe(4);
    expect(est.note).toBe('5 paired processes; 2 excluded');
  });

  it('is missing, not zero, when nothing pairs', () => {
    const est = stats.pairedRatio().of([{ arm: 'baseline', rep: 0, latency: 3, outcome: 'ok' }]);
    expect(est.median.value).toBeNull();
    expect(est.median.reason).toBe('no paired valid processes');
    expect(est.n).toBe(0);
  });
});

describe('stats.offered', () => {
  const process = (rep: number, n: number, extra: (i: number) => Row = () => ({})): Row[] =>
    Array.from({ length: n }, (_, i) => ({ rep, scheduledArrival: i * 0.5, outcome: i % 5 === 4 ? 'expired' : 'ok', windows: 2, ...extra(i) }));

  it('sums one offer window per process', () => {
    const rs = [...process(0, 10), ...process(1, 10)];
    const o = stats.offered(rs);
    // two windows of 4.5 s; 16 on time, 2 windows each
    expect(o.requestsOnTime!.value).toBeCloseTo(16 / 9, 12);
    expect(o.windowsOnTime!.value).toBeCloseTo(32 / 9, 12);
    expect(o.expired!.value).toBe(2);
    expect(o.offered!.value).toBe(20);
  });

  it('leaves a request without an arrival time out of the window instead of placing it at t = 0 (P-10)', () => {
    const rs = process(0, 10, (i) => ({ scheduledArrival: i + 1 }));
    rs[0]!.scheduledArrival = null;
    const o = stats.offered(rs);
    // arrivals 2..10: an 8 s window (Perf Lab: 0..10, 10 s)
    expect(o.requestsOnTime!.value).toBeCloseTo(8 / 8, 12);
    expect(o.requestsOnTime!.method).toMatch(/1 request without an arrival time/);
  });

  it('is missing when a process has no arrival times, or an on-time request has no window count (P-10)', () => {
    const none = stats.offered([...process(0, 4), ...process(1, 4, () => ({ scheduledArrival: undefined }))]);
    expect(none.requestsOnTime!.value).toBeNull();
    expect(none.requestsOnTime!.reason).toBe('1 of 2 processes have no scheduled arrival times');
    const noWindows = stats.offered(process(0, 4, (i) => (i === 1 ? { windows: undefined } : {})));
    expect(noWindows.requestsOnTime!.value).not.toBeNull();
    expect(noWindows.windowsOnTime!.value).toBeNull();
    expect(noWindows.windowsOnTime!.reason).toBe('1 on-time request without a window count');
  });
});

describe('aggregates', () => {
  const p = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    const h = (s.length - 1) * 0.95;
    return s[Math.floor(h)]! + (h - Math.floor(h)) * (s[Math.ceil(h)]! - s[Math.floor(h)]!);
  };

  it('compute type-7 quantiles and exclude missing values, counting them', () => {
    const xs = [5, 1, 4, 2, 3, 9, 7];
    const s = stats.summary(rows([...xs.map((latency) => ({ latency })), { latency: missing('lost') }]), 'latency');
    expect(s.count!.value).toBe(8);
    expect(s.p50!.value).toBe(4);
    expect(s.p95!.value).toBeCloseTo(p(xs), 12);
    expect(s.max!.value).toBe(9);
    expect(s.p50!.unit).toBe('ms');
    expect(s.p50!.method).toBe('p50 · 1 missing excluded');
  });

  it('take the weakest provenance of their inputs: observed or plain → derived, illustrative → illustrative', () => {
    const of = (vals: unknown[]) => rows(vals.map((v) => ({ v }))).stats('v', ['p50']).p50 as Value;
    expect(of([1, 2, 3]).prov).toBe('derived');
    expect(of([observed(1), observed(2)]).prov).toBe('derived');
    expect(of([observed(1), derived(2)]).prov).toBe('derived');
    expect(of([observed(1), illustrative(2)]).prov).toBe('illustrative');
    expect(of([illustrative(1), missing('x')]).prov).toBe('illustrative');
    expect(rows([{ v: illustrative(2) }, { v: 3 }]).sum('v').prov).toBe('illustrative');
    expect(isValue(of([]))).toBe(true);
    expect(of([]).value).toBeNull();
  });
});
