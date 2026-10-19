// Statistics over repetitions. A repetition (a fresh process for CUDA, a fresh GPUDevice for WebGPU) is the
// unit of resampling: timed launches inside one repetition share caches, clocks and allocator state, so they
// are summarised into one sample per repetition before anything here sees them. Every estimator is
// deterministic given its seed (the seed is honoured, unlike Perf Lab's pairedRatio: P-9).
import { sha256Hex } from './sha256.ts';

export interface Summary {
  /** Median of the samples; null when there are none */
  median: number | null;
  /** Bootstrap interval of the median at `level`; null when there are no samples */
  ci: [number, number] | null;
  /** Samples used */
  n: number;
  level: number;
  /** What the interval means, for a tooltip */
  method: string;
  /** Caveat a reader must see (no samples, one sample, zero spread, small n); null when there is none */
  note: string | null;
}

export interface SummarizeOpts {
  /** Confidence level of the interval, in (0, 1); default 0.95 */
  level?: number;
  /** Bootstrap resamples; default 2000 */
  draws?: number;
  /** Seed of the resampling; default 1 */
  seed?: number | string;
}

/** mulberry32: a small, fast 32-bit PRNG. Returns numbers in [0, 1). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A seeded PRNG in [0, 1). An integer seed is used directly (mod 2^32); any other seed (a string, a fraction)
 * is hashed, so `rng("w05:rep:3")` and `rng(7)` are both reproducible.
 */
export function rng(seed: number | string): () => number {
  const s = typeof seed === 'number' && Number.isInteger(seed) ? seed : parseInt(sha256Hex(String(seed)).slice(0, 8), 16);
  return mulberry32(s);
}

const finite = (xs: readonly number[], who: string): void => {
  for (const x of xs) if (typeof x !== 'number' || !Number.isFinite(x)) throw new RangeError(`${who}: samples must be finite numbers (got ${String(x)})`);
};

/** Quantile by linear interpolation between order statistics (Hyndman-Fan type 7); null for no data. */
export function quantile(xs: readonly number[], q: number): number | null {
  if (!(q >= 0 && q <= 1)) throw new RangeError(`quantile: q must be in [0, 1] (got ${q})`);
  if (!xs.length) return null;
  finite(xs, 'quantile');
  const s = [...xs].sort((a, b) => a - b);
  const h = (s.length - 1) * q;
  const lo = Math.floor(h);
  const hi = Math.min(lo + 1, s.length - 1);
  return s[lo]! + (h - lo) * (s[hi]! - s[lo]!);
}

export const median = (xs: readonly number[]): number | null => quantile(xs, 0.5);

const pct = (level: number): string => `${+(level * 100).toFixed(1)} %`;

/**
 * Median of the samples with a bootstrap interval over them.
 * - no samples: median and ci are null, note "no repetitions"
 * - one sample or zero spread: a degenerate interval [m, m] with a note saying why
 * - fewer than six samples: the note says the interval cannot extend beyond the sample range
 */
export function summarize(samples: readonly number[], opts: SummarizeOpts = {}): Summary {
  const level = opts.level ?? 0.95;
  const draws = opts.draws ?? 2000;
  if (!(level > 0 && level < 1)) throw new RangeError(`summarize: level must be in (0, 1) (got ${level})`);
  if (!Number.isInteger(draws) || draws < 1) throw new RangeError(`summarize: draws must be a positive integer (got ${draws})`);
  finite(samples, 'summarize');
  const n = samples.length;
  const method = `median of ${n} repetition${n === 1 ? '' : 's'}; ${pct(level)} bootstrap CI over repetitions`;
  if (n === 0) return { median: null, ci: null, n, level, method, note: 'no repetitions' };
  const m = median(samples)!;
  if (n === 1) return { median: m, ci: [m, m], n, level, method, note: 'single repetition' };
  if (samples.every((x) => x === samples[0])) return { median: m, ci: [m, m], n, level, method, note: 'zero spread' };
  const r = rng(opts.seed ?? 1);
  const boots: number[] = new Array(draws);
  const pick: number[] = new Array(n);
  for (let d = 0; d < draws; d++) {
    for (let i = 0; i < n; i++) pick[i] = samples[Math.floor(r() * n)]!;
    boots[d] = median(pick)!;
  }
  const lo = quantile(boots, (1 - level) / 2)!;
  const hi = quantile(boots, 1 - (1 - level) / 2)!;
  return { median: m, ci: [lo, hi], n, level, method, note: n < 6 ? `n = ${n}: the interval is bounded by the sample range` : null };
}

export interface Pair {
  /** Repetition index; each repetition contributes at most one pair */
  rep: number;
  /** Sample of the reference (denominator) */
  a: number;
  /** Sample of the candidate (numerator) */
  b: number;
}

export interface PairedSummary extends Summary {
  /** Pairs that could not be used, with the reason */
  excluded: Array<{ rep: number; reason: string }>;
}

/**
 * Median of b/a per repetition with a bootstrap interval; the repetition is the unit. A pair whose samples
 * are not finite and positive, or that repeats a repetition index, is excluded and listed, never dropped
 * silently.
 */
export function pairedRatio(pairs: readonly Pair[], opts: SummarizeOpts = {}): PairedSummary {
  const ratios: number[] = [];
  const excluded: PairedSummary['excluded'] = [];
  const seen = new Set<number>();
  for (const p of pairs) {
    if (seen.has(p.rep)) { excluded.push({ rep: p.rep, reason: 'duplicate repetition' }); continue; }
    seen.add(p.rep);
    if (!(Number.isFinite(p.a) && p.a > 0 && Number.isFinite(p.b) && p.b > 0)) {
      excluded.push({ rep: p.rep, reason: `samples must be finite and positive (a = ${p.a}, b = ${p.b})` });
      continue;
    }
    ratios.push(p.b / p.a);
  }
  const s = summarize(ratios, opts);
  const n = s.n;
  return { ...s, method: `paired ratio b/a over ${n} repetition${n === 1 ? '' : 's'}; ${pct(s.level)} bootstrap CI over repetitions`, excluded };
}

/** True when two intervals do not overlap. An absent interval is never separated from anything. */
export function separated(x: { ci: readonly [number, number] | null }, y: { ci: readonly [number, number] | null }): boolean {
  if (!x.ci || !y.ci) return false;
  return x.ci[1] < y.ci[0] || y.ci[1] < x.ci[0];
}
