// The parts of the measurement protocol (guide §28) that every executor shares: the order kernels run in within a
// repetition, and the output check against the Loop IR reference. The page's WebGPU protocol and the server's CUDA
// jobs both call these, so a repetition interleaves kernels identically and a check passes by the same rule.
import { rng } from './stats.ts';

/** The order of `n` kernels in repetition `rep`: a Fisher–Yates shuffle seeded by `${seed}:${rep}`. */
export function repetitionOrder(n: number, seed: number, rep: number): number[] {
  const r = rng(`${seed}:${rep}`);
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

export interface SampleCheck {
  ok: boolean;
  /** Infinity when a compared value is NaN */
  maxAbs: number;
  /** Compared values outside the tolerance */
  bad: number;
  /** Values compared (reference samples that are NaN are skipped) */
  n: number;
  /** Reference samples skipped because the reference is NaN there */
  skipped: number;
  /** Index (into the sampled values) of the first value outside the tolerance, or -1 */
  first: number;
  message: string;
}

/**
 * Compare sampled outputs with the reference at the same indices: both rounded to float32,
 * |got − want| ≤ atol + rtol·|want|. A reference sample that is NaN (or null: JSON has no NaN) is skipped, since the
 * program is undefined there on these inputs; an output that is NaN is compared as 1e30, so it fails.
 */
export function checkSamples(got: ArrayLike<number>, want: ArrayLike<number | null>, { rtol = 2e-3, atol = 2e-4 }: { rtol?: number; atol?: number } = {}): SampleCheck {
  if (got.length !== want.length) return { ok: false, maxAbs: Infinity, bad: want.length, n: 0, skipped: 0, first: -1, message: `sizes differ: ${got.length} outputs for ${want.length} reference values` };
  const keep: number[] = [];
  for (let i = 0; i < want.length; i++) {
    const w = want[i];
    if (w !== null && w !== undefined && !Number.isNaN(w)) keep.push(i);
  }
  const skipped = want.length - keep.length;
  if (!keep.length) return { ok: true, maxAbs: 0, bad: 0, n: 0, skipped, first: -1, message: `the reference is undefined (NaN) at all ${skipped} sampled outputs on these inputs; nothing to compare` };
  let maxAbs = 0, bad = 0, first = -1;
  for (const i of keep) {
    const raw = got[i]!;
    const g = Math.fround(Number.isNaN(raw) ? 1e30 : raw), w = Math.fround(want[i] as number);
    const d = Math.abs(g - w);
    if (!(d <= atol + rtol * Math.abs(w))) {
      bad++;
      if (first < 0) first = i;
    }
    if (Number.isNaN(d) || d > maxAbs) maxAbs = Number.isNaN(d) ? Infinity : d;
  }
  let message = bad ? `${bad} of ${keep.length} values differ (first at ${first}: ${got[first]} vs ${want[first]}), max abs diff ${maxAbs.toExponential(2)}` : `max abs diff ${maxAbs.toExponential(2)}`;
  if (skipped) message += ` (${skipped} samples skipped: the reference is NaN there)`;
  return { ok: bad === 0, maxAbs, bad, n: keep.length, skipped, first, message };
}
