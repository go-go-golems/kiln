import { describe, expect, it } from 'vitest';
import { derived, heuristic, missing, observed, ProvenanceError, seal, type Value } from '../src/values.ts';
import { verdict } from '../src/verdict.ts';
import { makeRecord } from './fixtures.ts';

type Ratio = { ratio: Value; lo: Value; hi: Value; n: number };
const ratioRow = (r: number | null, lo: number | null, hi: number | null): Ratio => ({
  ratio: r === null ? missing('no measurement') : derived(r),
  lo: lo === null ? missing('no measurement') : derived(lo),
  hi: hi === null ? missing('no measurement') : derived(hi),
  n: 7,
});
// predicates in project scripts are JavaScript and compare Values directly (`r.hi < 0.5`); TypeScript
// refuses that, so the tests cast at compile time and the comparison at run time is the same one
const n = (v: unknown) => v as number;
const valid = makeRecord();
const invalid = makeRecord((r) => { r.check.ok = false; r.validity = { ok: false, reasons: ['output check: 3 of 512 sampled outputs differ'], partial: [] }; });

describe('verdict: the truth table of guide §29.3', () => {
  it('invalid support → unqualified, before anything else (even with no rows)', () => {
    const out = verdict({ rows: [], predicate: () => true, support: [valid, invalid] });
    expect(out.verdict).toBe('unqualified');
    expect(out.reasons).toEqual([`record ${invalid.id.slice(0, 12)}: output check: 3 of 512 sampled outputs differ`]);
    expect(verdict({ rows: [ratioRow(0.4, 0.3, 0.45)], predicate: (r) => n(r.hi) < 0.5, support: [invalid] }).verdict).toBe('unqualified');
    expect(verdict({ rows: [{ x: 1 }], predicate: () => true, support: [{ id: 'abc' }] }).reasons).toEqual(['record abc: no validity']);
  });

  it('no rows → open', () => {
    expect(verdict({ rows: [], predicate: () => true, support: [valid] })).toEqual({ verdict: 'open', checks: [], reasons: ['no rows: nothing measured yet'] });
  });

  it('every row passes → supported', () => {
    const out = verdict({ rows: [ratioRow(0.4, 0.3, 0.45), ratioRow(0.35, 0.3, 0.4)], predicate: (r) => n(r.hi) < 0.5, support: [valid] });
    expect(out.verdict).toBe('supported');
    expect(out.checks.map((c) => c.pass)).toEqual([true, true]);
    expect(out.reasons).toEqual([]);
  });

  it('one clean counterexample → refuted, even beside undecided rows', () => {
    const out = verdict({ rows: [ratioRow(0.4, 0.3, 0.45), ratioRow(0.6, 0.55, 0.7), ratioRow(null, null, null)], predicate: (r) => n(r.hi) < 0.5 });
    expect(out.verdict).toBe('refuted');
    expect(out.checks.map((c) => c.pass)).toEqual([true, false, null]);
    expect(out.reasons).toEqual(['row 1: the prediction does not hold']);
  });

  it('a throwing predicate is undecided, never a refutation, and keeps the error', () => {
    const out = verdict({ rows: [{ x: 1 }], predicate: () => { throw new Error('ev.ratio: no option MAP=tiled'); } });
    expect(out.verdict).toBe('open');
    expect(out.checks[0]).toMatchObject({ pass: null, error: 'ev.ratio: no option MAP=tiled' });
    expect(out.reasons).toEqual(['row 0: the predicate threw: ev.ratio: no option MAP=tiled']);
    expect(verdict({ rows: [{ x: 1 }], predicate: () => { throw 'plain string'; } }).checks[0]!.error).toBe('plain string');
  });

  it('a negative predicate over a missing value is undecided (the NaN hole)', () => {
    const rows = [ratioRow(null, null, null)];
    expect(verdict({ rows, predicate: (r) => !(n(r.hi) > 0.5) }).verdict).toBe('open');
    expect(verdict({ rows, predicate: (r) => n(r.hi) > 0.5 }).verdict).toBe('open');
    expect(verdict({ rows, predicate: (r) => !(n(r.hi) > 0.5) }).checks[0]!.missing).toEqual(['hi']);
    expect(verdict({ rows, predicate: (r) => !(n(r.hi) > 0.5) }).reasons).toEqual(['row 0: missing hi (no measurement)']);
  });

  it('a missing field the predicate does not read does not block its row', () => {
    const rows = [{ model: heuristic(80, { unit: 'us' }), time: missing('no measurement on this device') }];
    expect(verdict({ rows, predicate: (r) => n(r.model) < 100 }).verdict).toBe('supported');
    expect(verdict({ rows, predicate: (r) => n(r.model) < 50 }).verdict).toBe('refuted');
    expect(verdict({ rows, predicate: (r) => n(r.time) < n(r.model) }).verdict).toBe('open');
  });

  it('reads are tracked through nested objects and arrays', () => {
    const rows = [{ k: { t: missing('no measurement'), model: heuristic(80) }, reps: [observed(3), missing('rep 2 lost')] }];
    expect(verdict({ rows, predicate: (r) => !(n(r.k.t) > 1) }).checks[0]).toMatchObject({ pass: null, missing: ['k.t'] });
    expect(verdict({ rows, predicate: (r) => n(r.k.model) < 100 }).verdict).toBe('supported');
    expect(verdict({ rows, predicate: (r) => n(r.reps[0]) > 1 }).verdict).toBe('supported');
    expect(verdict({ rows, predicate: (r) => r.reps.every((x) => !(n(x) > 100)) }).reasons).toEqual(['row 0: missing reps.1 (rep 2 lost)']);
    expect(verdict({ rows, predicate: (r) => { (r.k as { t: unknown }).t = observed(0); return true; } }).checks[0]!.error).toMatch(/cannot change its row/);
    const frozen = Object.freeze({ inner: Object.freeze({ x: missing('none') }) });
    expect(verdict({ rows: [{ f: frozen }], predicate: (r) => !(n(r.f.inner.x) > 1) }).checks[0]).toMatchObject({ pass: null, missing: ['f.inner.x'] });
  });

  it('plain NaN, null and undefined fields count as missing', () => {
    for (const x of [Number.NaN, null, undefined]) expect(verdict({ rows: [{ x }], predicate: (r) => !(n(r.x) > 1) }).verdict).toBe('open');
  });

  it('the predicate may return a Value or a number: missing and NaN are undecided', () => {
    expect(verdict({ rows: [{ a: 1 }], predicate: () => derived(true) }).verdict).toBe('supported');
    expect(verdict({ rows: [{ a: 1 }], predicate: () => derived(false) }).verdict).toBe('refuted');
    expect(verdict({ rows: [{ a: 1 }], predicate: () => missing('no data') }).verdict).toBe('open');
    expect(verdict({ rows: [{ a: 1 }], predicate: () => Number.NaN }).verdict).toBe('open');
    expect(verdict({ rows: [{ a: 1 }], predicate: () => 0 }).verdict).toBe('refuted');
  });

  it('destructuring and spreading count as reads', () => {
    const rows = [{ a: observed(1), b: missing('none') }];
    expect(verdict({ rows, predicate: ({ a }) => n(a) > 0 }).verdict).toBe('supported');
    expect(verdict({ rows, predicate: ({ a, b }) => n(a) > 0 || n(b) > 0 }).verdict).toBe('open');
    expect(verdict({ rows, predicate: (r) => Object.values({ ...r }).length === 2 }).verdict).toBe('open');
  });

  it('a predicate cannot change its row, sealed or not', () => {
    const plain = { x: 1 };
    const out = verdict({ rows: [plain], predicate: (r) => { (r as { x: number }).x = 0; return true; } });
    expect(out.verdict).toBe('open');
    expect(out.checks[0]!.error).toMatch(/cannot change its row/);
    expect(plain.x).toBe(1);
    const s = seal({ x: observed(2) });
    expect(verdict({ rows: [s], predicate: (r) => n(r.x) > 1 }).verdict).toBe('supported');
    expect(() => { throw new ProvenanceError('x'); }).toThrow(ProvenanceError);
  });
});
