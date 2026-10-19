import { describe, expect, it } from 'vitest';
import { canonicalJSON, CanonicalJSONError } from '../src/canonical.ts';
import { observed } from '../src/values.ts';

describe('canonicalJSON', () => {
  it('sorts keys at every depth and keeps array order', () => {
    expect(canonicalJSON({ b: 1, a: { d: [3, 1, 2], c: 'x' } })).toBe('{"a":{"c":"x","d":[3,1,2]},"b":1}');
    expect(canonicalJSON({ b: 1, a: 2 })).toBe(canonicalJSON({ a: 2, b: 1 }));
  });

  it('writes scalars like JSON.stringify', () => {
    expect(canonicalJSON([1.5, 1e21, 1e-7, 'q"\\\n', true, false, null])).toBe(JSON.stringify([1.5, 1e21, 1e-7, 'q"\\\n', true, false, null]));
    expect(canonicalJSON('\ud800')).toBe(JSON.stringify('\ud800'));
  });

  it('writes -0 as 0', () => {
    expect(canonicalJSON(-0)).toBe('0');
    expect(canonicalJSON({ x: -0 })).toBe(canonicalJSON({ x: 0 }));
  });

  it('accepts null-prototype objects and shared (acyclic) references', () => {
    const o = Object.assign(Object.create(null) as object, { z: 1, a: 2 });
    expect(canonicalJSON(o)).toBe('{"a":2,"z":1}');
    const shared = { v: 1 };
    expect(canonicalJSON({ a: shared, b: shared, c: [shared, shared] })).toBe('{"a":{"v":1},"b":{"v":1},"c":[{"v":1},{"v":1}]}');
  });

  it.each([
    ['undefined property', { a: undefined }, '$.a'],
    ['undefined element', [1, undefined], '$[1]'],
    ['array hole', [1, , 3], '$[1]'],
    ['NaN', { x: { y: Number.NaN } }, '$.x.y'],
    ['Infinity', [Infinity], '$[0]'],
    ['-Infinity', -Infinity, '$'],
    ['function', { f: () => 1 }, '$.f'],
    ['symbol', { s: Symbol('s') }, '$.s'],
    ['bigint', { n: 1n }, '$.n'],
    ['Map', { m: new Map() }, '$.m'],
    ['Date', { d: new Date(0) }, '$.d'],
    ['class instance', { c: new (class Foo { x = 1; })() }, '$.c'],
    ['Value (not plain)', { v: observed(1) }, '$.v'],
  ])('refuses %s', (_name, input, path) => {
    expect(() => canonicalJSON(input)).toThrow(CanonicalJSONError);
    expect(() => canonicalJSON(input)).toThrow(path);
  });

  it('refuses cycles', () => {
    const a: Record<string, unknown> = { x: 1 };
    a.self = a;
    expect(() => canonicalJSON(a)).toThrow(/cycle at \$\.self/);
    const arr: unknown[] = [];
    arr.push([arr]);
    expect(() => canonicalJSON(arr)).toThrow(/cycle/);
  });
});
