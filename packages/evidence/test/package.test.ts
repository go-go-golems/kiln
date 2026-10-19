import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import * as evidence from '../src/index.ts';

// Guide Appendix B: the public surface of @kiln/evidence
const APPENDIX_B = [
  'observed', 'derived', 'heuristic', 'illustrative', 'missing',
  'isValue', 'num', 'isMissing', 'provOf', 'combine', 'seal',
  'median', 'quantile', 'rng', 'summarize', 'pairedRatio', 'separated',
  'sha256Hex', 'canonicalJSON', 'contentId', 'deviceId', 'recordId', 'validateRecord', 'verdict',
];

describe('@kiln/evidence', () => {
  it('exports everything in guide Appendix B', () => {
    for (const name of APPENDIX_B) expect(typeof (evidence as Record<string, unknown>)[name], name).toBe('function');
    expect(evidence.ProvenanceError.prototype).toBeInstanceOf(Error);
  });

  it('imports under plain Node (type stripping), with no build step', () => {
    const url = new URL('../src/index.ts', import.meta.url).href;
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', `const m = await import(${JSON.stringify(url)}); console.log(m.sha256Hex('abc'), m.verdict({ rows: [], predicate: () => true }).verdict);`], { encoding: 'utf8' });
    expect(r.stderr.replace(/^.*ExperimentalWarning.*$|^.*--trace-warnings.*$/gm, '').trim()).toBe('');
    expect(r.stdout.trim()).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad open');
  });
});
