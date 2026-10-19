import { describe, expect, it } from 'vitest';
import { median, pairedRatio, quantile, rng, separated, summarize } from '../src/stats.ts';

describe('basic statistics', () => {
  it('median and quantile (type 7)', () => {
    expect(median([])).toBeNull();
    expect(median([5])).toBe(5);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(quantile([1, 2, 3, 4, 5], 0)).toBe(1);
    expect(quantile([1, 2, 3, 4, 5], 1)).toBe(5);
    expect(quantile([1, 2, 3, 4], 0.25)).toBe(1.75);
    expect(quantile([10, 20], 0.9)).toBeCloseTo(19);
    expect(() => quantile([1], 1.5)).toThrow(RangeError);
    expect(() => median([1, Number.NaN])).toThrow(RangeError);
    const xs = [3, 1, 2];
    median(xs);
    expect(xs).toEqual([3, 1, 2]);
  });

  it('rng is deterministic per seed, string or number', () => {
    const a = rng(7), b = rng(7), c = rng(8), s1 = rng('w05:rep:3'), s2 = rng('w05:rep:3');
    const take = (r: () => number) => Array.from({ length: 5 }, r);
    expect(take(a)).toEqual(take(b));
    expect(take(rng(7))).not.toEqual(take(c));
    expect(take(s1)).toEqual(take(s2));
    for (const x of take(rng(1))) expect(x >= 0 && x < 1).toBe(true);
  });
});

describe('summarize', () => {
  it('handles no samples, one sample and zero spread without inventing an interval', () => {
    expect(summarize([])).toMatchObject({ median: null, ci: null, n: 0, note: 'no repetitions' });
    expect(summarize([4])).toMatchObject({ median: 4, ci: [4, 4], n: 1, note: 'single repetition' });
    expect(summarize([2, 2, 2])).toMatchObject({ median: 2, ci: [2, 2], n: 3, note: 'zero spread' });
  });

  it('gives a median with an interval inside the sample range, labelled for small n', () => {
    const s = summarize([10, 12, 11, 13, 9]);
    expect(s.median).toBe(11);
    expect(s.ci![0]).toBeGreaterThanOrEqual(9);
    expect(s.ci![1]).toBeLessThanOrEqual(13);
    expect(s.ci![0]).toBeLessThanOrEqual(11);
    expect(s.ci![1]).toBeGreaterThanOrEqual(11);
    expect(s.note).toBe('n = 5: the interval is bounded by the sample range');
    expect(s.method).toBe('median of 5 repetitions; 95 % bootstrap CI over repetitions');
    expect(summarize([1, 2, 3, 4, 5, 6]).note).toBeNull();
  });

  it('two samples: the bootstrap median takes only a, (a+b)/2 or b, so the interval is [a, b]', () => {
    expect(summarize([1, 3], { seed: 4 }).ci).toEqual([1, 3]);
  });

  it('honours the seed: same seed, same interval; the default seed is fixed', () => {
    const xs = [10.2, 9.8, 10.5, 11.9, 10.1, 9.7, 10.0, 12.4, 10.3];
    expect(summarize(xs, { seed: 3 })).toEqual(summarize(xs, { seed: 3 }));
    expect(summarize(xs)).toEqual(summarize(xs, { seed: 1 }));
    const cis = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => JSON.stringify(summarize(xs, { seed, draws: 50 }).ci)));
    expect(cis.size).toBeGreaterThan(1);
  });

  it('narrows with a lower level', () => {
    const xs = Array.from({ length: 30 }, (_, i) => 100 + ((i * 37) % 17));
    const wide = summarize(xs, { level: 0.99 }).ci!, narrow = summarize(xs, { level: 0.5 }).ci!;
    expect(narrow[0]).toBeGreaterThanOrEqual(wide[0]);
    expect(narrow[1]).toBeLessThanOrEqual(wide[1]);
  });

  it('refuses bad samples and options', () => {
    expect(() => summarize([1, Number.NaN])).toThrow(RangeError);
    expect(() => summarize([1, 2], { level: 1 })).toThrow(RangeError);
    expect(() => summarize([1, 2], { draws: 0 })).toThrow(RangeError);
  });
});

describe('pairedRatio', () => {
  it('is the median of b/a per repetition', () => {
    const s = pairedRatio([{ rep: 0, a: 10, b: 5 }, { rep: 1, a: 20, b: 8 }, { rep: 2, a: 4, b: 3 }]);
    expect(s.median).toBe(0.5);
    expect(s.n).toBe(3);
    expect(s.ci![0]).toBeGreaterThanOrEqual(0.4);
    expect(s.ci![1]).toBeLessThanOrEqual(0.75);
    expect(s.method).toBe('paired ratio b/a over 3 repetitions; 95 % bootstrap CI over repetitions');
    expect(s.excluded).toEqual([]);
  });

  it('lists what it could not use instead of dropping it', () => {
    const s = pairedRatio([{ rep: 0, a: 10, b: 5 }, { rep: 0, a: 1, b: 1 }, { rep: 1, a: 0, b: 2 }, { rep: 2, a: Number.NaN, b: 1 }]);
    expect(s.n).toBe(1);
    expect(s.excluded.map((e) => [e.rep, e.reason.split(' ')[0]])).toEqual([[0, 'duplicate'], [1, 'samples'], [2, 'samples']]);
    expect(pairedRatio([]).median).toBeNull();
  });

  it('honours the seed', () => {
    const pairs = Array.from({ length: 8 }, (_, rep) => ({ rep, a: 10 + (rep % 3), b: 6 + ((rep * 5) % 4) }));
    expect(pairedRatio(pairs, { seed: 9 })).toEqual(pairedRatio(pairs, { seed: 9 }));
  });
});

describe('separated', () => {
  it('is true only when the intervals do not overlap', () => {
    expect(separated({ ci: [1, 2] }, { ci: [3, 4] })).toBe(true);
    expect(separated({ ci: [3, 4] }, { ci: [1, 2] })).toBe(true);
    expect(separated({ ci: [1, 3] }, { ci: [3, 4] })).toBe(false);
    expect(separated({ ci: [1, 5] }, { ci: [2, 3] })).toBe(false);
    expect(separated({ ci: null }, { ci: [1, 2] })).toBe(false);
  });
  it('reduces to comparing medians for deterministic (zero-width) summaries', () => {
    expect(separated(summarize([5]), summarize([6]))).toBe(true);
    expect(separated(summarize([5]), summarize([5]))).toBe(false);
  });
});
