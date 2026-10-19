import { describe, expect, it } from 'vitest';
import { checkSamples, repetitionOrder } from '../src/protocol.ts';

describe('repetitionOrder', () => {
  it('is a seeded permutation', () => {
    for (const [n, seed, rep] of [[0, 1, 0], [1, 7, 3], [5, 1, 0], [64, 7, 63]] as const) {
      const o = repetitionOrder(n, seed, rep);
      expect(o.slice().sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i));
      expect(repetitionOrder(n, seed, rep)).toEqual(o);
    }
  });

  it('pins the orders records already carry positions for', () => {
    // a change here moves every recorded position: bump the protocol, do not edit these
    expect([0, 1, 2, 3].map((rep) => repetitionOrder(5, 1, rep).join(''))).toEqual(['02341', '23401', '03412', '43102']);
  });
});

describe('checkSamples', () => {
  it('compares in float32 with atol + rtol·|want|', () => {
    expect(checkSamples([1, -2, 0.5], [1, -2, 0.5])).toMatchObject({ ok: true, bad: 0, n: 3, maxAbs: 0 });
    expect(checkSamples([1.001], [1]).ok).toBe(true);
    expect(checkSamples([1.01], [1])).toMatchObject({ ok: false, bad: 1, first: 0 });
    expect(checkSamples([0.1], [Math.fround(0.1)]).ok).toBe(true);
  });

  it('skips samples where the reference is NaN, sent as NaN or as null', () => {
    const viaNaN = checkSamples([1, 7], [1, NaN]), viaNull = checkSamples([1, 7], [1, null]);
    expect(viaNaN).toEqual(viaNull);
    expect(viaNaN).toMatchObject({ ok: true, n: 1, skipped: 1 });
    expect(viaNaN.message).toMatch(/1 samples skipped/);
    expect(checkSamples([3], [null])).toMatchObject({ ok: true, n: 0, skipped: 1 });
  });

  it('fails a NaN output and a size mismatch', () => {
    expect(checkSamples([NaN], [1])).toMatchObject({ ok: false, bad: 1 });
    expect(checkSamples([1], [1, 2])).toMatchObject({ ok: false, maxAbs: Infinity });
  });
});
