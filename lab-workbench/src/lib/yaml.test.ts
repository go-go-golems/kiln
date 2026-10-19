import { describe, expect, it } from 'vitest';
import { toYaml, tryJson, yamlScalar } from './yaml';

describe('toYaml', () => {
  it('quotes only strings that would read back as something else', () => {
    expect(['hello world', 'true', '12', 'a: b', '- x', '', ' padded', '#tag', 'sampler-local/baseline/timing#0'].map(yamlScalar)).toEqual([
      'hello world',
      '"true"',
      '"12"',
      '"a: b"',
      '"- x"',
      '""',
      '" padded"',
      '"#tag"',
      'sampler-local/baseline/timing#0',
    ]);
    expect([null, undefined, true, 3.5, Number.NaN, -Infinity].map(yamlScalar)).toEqual(['null', 'null', 'true', '3.5', '.nan', '-.inf']);
  });

  it('writes nested mappings and sequences in block style', () => {
    const v = { experiment_id: 'sampler-local', arms: [{ name: 'baseline', switches: { impl: 'unfused' } }, { name: 'candidate' }], reps: 4, empty: [], none: {}, note: 'line one\nline two' };
    expect(toYaml(v)).toBe(
      [
        'experiment_id: sampler-local',
        'arms:',
        '  - name: baseline',
        '    switches:',
        '      impl: unfused',
        '  - name: candidate',
        'reps: 4',
        'empty: []',
        'none: {}',
        'note: |',
        '  line one',
        '  line two',
      ].join('\n'),
    );
    expect(toYaml([[1, 2], 'x'])).toBe('- - 1\n  - 2\n- x');
  });
});

describe('tryJson', () => {
  it('parses JSON and refuses text', () => {
    expect(tryJson('{"a": 1}')).toEqual({ ok: true, value: { a: 1 } });
    expect(tryJson('[1, 2')).toEqual({ ok: false });
    expect(tryJson('TypeError: x is undefined')).toEqual({ ok: false });
    expect(tryJson('42')).toEqual({ ok: true, value: 42 });
  });
});
