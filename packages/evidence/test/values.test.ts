import { describe, expect, it } from 'vitest';
import {
  combine, derived, heuristic, illustrative, isMissing, isSealed, isValue, missing, num, observed, provOf,
  ProvenanceError, raw, seal, type Prov, type Value,
} from '../src/values.ts';

describe('values', () => {
  it('constructors set the class and keep the options', () => {
    const v = observed(12.5, { unit: 'us', method: 'median of 20 timed launches (gpu-timestamp)', n: 20 });
    expect(isValue(v)).toBe(true);
    expect([v.prov, v.value, v.unit, v.n]).toEqual(['observed', 12.5, 'us', 20]);
    expect(derived(1).prov).toBe('derived');
    expect(heuristic(1).prov).toBe('heuristic');
    expect(illustrative('x').prov).toBe('illustrative');
    expect('unit' in derived(1)).toBe(false);
  });

  it('compare like numbers; a missing value compares as NaN', () => {
    const a = observed(2), b = derived(3), m = missing('no measurement on this device');
    expect((a as unknown as number) < (b as unknown as number)).toBe(true);
    expect((m as unknown as number) < 1).toBe(false);
    expect((m as unknown as number) > 1).toBe(false);
    expect(Number.isNaN(+(m as unknown as number))).toBe(true);
    expect(String(m)).toBe('missing(no measurement on this device)');
    expect(String(observed(4, { unit: 'us' }))).toBe('4 us');
  });

  it('turn null and non-finite numbers into missing values, never data', () => {
    for (const v of [observed(Number.NaN, { unit: 'us' }), derived(Infinity), heuristic(null)]) {
      expect(v.prov).toBe('unknown');
      expect(v.value).toBeNull();
      expect(v.reason).toBeTruthy();
    }
    expect(observed(Number.NaN, { unit: 'us' }).unit).toBe('us');
  });

  it('helpers', () => {
    expect(raw(observed(3))).toBe(3);
    expect(raw('s')).toBe('s');
    expect(num(observed(3))).toBe(3);
    expect(num(missing('x'))).toBeNull();
    expect(num('3')).toBeNull();
    expect(isMissing(missing('x'))).toBe(true);
    expect(isMissing(null)).toBe(true);
    expect(isMissing(undefined)).toBe(true);
    expect(isMissing(Number.NaN)).toBe(true);
    expect(isMissing(0)).toBe(false);
    expect(provOf(observed(1))).toBe('observed');
    expect(provOf(1)).toBe('unknown');
    expect(provOf(1, 'heuristic')).toBe('heuristic');
  });
});

describe('combine', () => {
  const P: Prov[] = ['observed', 'derived', 'heuristic', 'illustrative', 'unknown'];
  const expected: Record<string, Prov> = {
    'observed+observed': 'derived', 'observed+derived': 'derived', 'observed+heuristic': 'heuristic',
    'observed+illustrative': 'illustrative', 'observed+unknown': 'unknown', 'derived+derived': 'derived',
    'derived+heuristic': 'heuristic', 'derived+illustrative': 'illustrative', 'derived+unknown': 'unknown',
    'heuristic+heuristic': 'heuristic', 'heuristic+illustrative': 'illustrative', 'heuristic+unknown': 'unknown',
    'illustrative+illustrative': 'illustrative', 'illustrative+unknown': 'unknown', 'unknown+unknown': 'unknown',
  };
  it('is the weakest class, observed inputs yielding derived, in either order', () => {
    for (let i = 0; i < P.length; i++) for (let j = i; j < P.length; j++) {
      const want = expected[`${P[i]}+${P[j]}`];
      expect(combine(P[i]!, P[j]!), `${P[i]}+${P[j]}`).toBe(want);
      expect(combine(P[j]!, P[i]!), `${P[j]}+${P[i]}`).toBe(want);
    }
  });
  it('takes Values, one input, or none', () => {
    expect(combine(heuristic(1), observed(2))).toBe('heuristic');
    expect(combine('observed')).toBe('derived');
    expect(combine()).toBe('unknown');
    expect(() => combine('measured' as Prov)).toThrow(TypeError);
  });
});

describe('seal', () => {
  const fixture = () => ({ id: 'r1', timing: { samples: [1, 2, 3] }, metrics: { time: observed(5, { unit: 'us' }) }, tags: ['b', 'a'] });

  it('throws ProvenanceError on set, delete and defineProperty, at every depth', () => {
    const s = seal(fixture());
    const attempts: Array<[string, () => unknown]> = [
      ['set top', () => { (s as Record<string, unknown>).id = 'x'; }],
      ['add top', () => { (s as Record<string, unknown>).extra = 1; }],
      ['delete top', () => { delete (s as Partial<typeof s>).tags; }],
      ['define top', () => Object.defineProperty(s, 'id', { value: 'x' })],
      ['set nested', () => { s.timing.samples[0] = 0; }],
      ['push nested', () => s.timing.samples.push(4)],
      ['length nested', () => { s.timing.samples.length = 0; }],
      ['set Value field', () => { (s.metrics.time as { value: unknown }).value = 0; }],
      ['define nested', () => Object.defineProperty(s.metrics, 'time', { value: 0 })],
      ['delete nested', () => { delete (s.metrics as Partial<typeof s.metrics>).time; }],
      ['setPrototypeOf', () => Object.setPrototypeOf(s.metrics, null)],
      ['freeze', () => Object.freeze(s.timing)],
      ['sort in place', () => s.tags.sort()],
    ];
    for (const [name, f] of attempts) expect(f, name).toThrow(ProvenanceError);
    expect(s.timing.samples).toEqual([1, 2, 3]);
    expect(s.id).toBe('r1');
  });

  it('reads like the original: values, arrays, prototypes, iteration, JSON', () => {
    const s = seal(fixture());
    expect(Array.isArray(s.timing.samples)).toBe(true);
    expect([...s.timing.samples]).toEqual([1, 2, 3]);
    expect(s.timing.samples.map((x) => x * 2)).toEqual([2, 4, 6]);
    expect(isValue(s.metrics.time)).toBe(true);
    expect((s.metrics.time as unknown as number) > 4).toBe(true);
    expect(JSON.parse(JSON.stringify(s))).toEqual(JSON.parse(JSON.stringify(fixture())));
    expect(Object.keys(s)).toEqual(['id', 'timing', 'metrics', 'tags']);
    expect(isSealed(s) && isSealed(s.timing) && isSealed(s.metrics.time)).toBe(true);
  });

  it('is a snapshot: changing the original later does not show through', () => {
    const o = fixture();
    const s = seal(o);
    o.timing.samples[0] = 99;
    o.id = 'changed';
    expect(s.timing.samples[0]).toBe(1);
    expect(s.id).toBe('r1');
  });

  it('seals frozen inputs, keeps shared references shared, survives cycles, and is idempotent', () => {
    const shared = { v: 1 };
    const o: Record<string, unknown> = Object.freeze({ a: shared, b: shared, deep: Object.freeze({ x: [1] }) });
    const s = seal(o) as { a: object; b: object; deep: { x: number[] } };
    expect(s.a).toBe(s.b);
    expect(() => { s.deep.x[0] = 2; }).toThrow(ProvenanceError);
    const c: Record<string, unknown> = { n: 1 };
    c.self = c;
    const sc = seal(c);
    expect(sc.self).toBe(sc);
    expect(seal(sc)).toBe(sc);
    expect(seal(3)).toBe(3);
    expect(seal(null)).toBe(null);
  });

  it('refuses objects it cannot snapshot', () => {
    expect(() => seal({ m: new Map() })).toThrow(ProvenanceError);
    expect(() => seal({ b: new Float32Array(2) })).toThrow(ProvenanceError);
  });

  it('turns accessors into the values they returned', () => {
    let n = 0;
    const s = seal({ get x() { n++; return { y: 1 }; } });
    expect(s.x.y).toBe(1);
    expect(s.x.y).toBe(1);
    expect(n).toBe(1);
    expect(() => { (s.x as { y: number }).y = 2; }).toThrow(ProvenanceError);
  });

  it('keeps Value semantics for missing values', () => {
    const s = seal({ t: missing('none') as Value });
    expect((s.t as unknown as number) < 1).toBe(false);
    expect(String(s.t)).toBe('missing(none)');
  });
});
