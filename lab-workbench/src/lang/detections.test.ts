import { describe, expect, it } from 'vitest';
import golden from './__fixtures__/quality-golden.json';
import { compareDetections, compareGroundTruth, evaluateDetections, verdicts, type Detection, type GroundTruth } from './detections';

/**
 * Golden outputs of PR 1005's grounding_dino_quality.py, produced by
 * ttmp/2026/10/12/ML-PERF-002-…/scripts/01-quality-golden.py from the DGX archive's 16 recorded images and
 * constructed edge cases. The port must agree on every field.
 */

interface Case {
  name: string;
  baseline: Detection[];
  candidate: Detection[];
  truth: GroundTruth[];
  compare: Record<string, unknown>;
  groundTruth: Record<string, unknown>;
  evaluateBaseline: Record<string, unknown>;
}

const cases = (golden as unknown as { cases: Case[] }).cases;
const strip = ({ assignment: _a, ...rest }: Record<string, unknown>) => rest;

describe('detection matching equals the PR quality helpers', () => {
  it('has the cases the generator wrote', () => {
    expect(cases).toHaveLength(26);
  });

  it.each(cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(compareDetections(c.baseline, c.candidate)).toEqual(c.compare);
    const gt = compareGroundTruth(c.baseline, c.candidate, c.truth);
    expect({ ...gt, baseline: strip(gt.baseline), candidate: strip(gt.candidate) }).toEqual(c.groundTruth);
    expect(strip(evaluateDetections(c.baseline, c.truth) as unknown as Record<string, unknown>)).toEqual(c.evaluateBaseline);
  });
});

describe('per-detection verdicts', () => {
  const A: Detection = { label: 'chair', confidence: 0.7, bbox: [0.1, 0.2, 0.3, 0.4] };
  const B: Detection = { label: 'chair', confidence: 0.6, bbox: [0.5, 0.5, 0.7, 0.9] };

  it('labels each box exact, within tolerance, changed, added or dropped', () => {
    expect(verdicts([A, B], [A, B]).candidate.map((v) => v.status)).toEqual(['exact', 'exact']);
    expect(verdicts([A], [{ ...A, confidence: 0.705 }]).baseline[0]).toMatchObject({ status: 'within-tolerance', confDelta: expect.closeTo(0.005, 9) });
    expect(verdicts([A], [{ ...A, bbox: [0.11, 0.2, 0.3, 0.4] }]).candidate[0].status).toBe('changed');
    const v = verdicts([A], [A, B]);
    expect(v.candidate.map((x) => x.status)).toEqual(['exact', 'added']);
    expect(verdicts([A, B], [B]).baseline.map((x) => x.status)).toEqual(['dropped', 'exact']);
  });
});
