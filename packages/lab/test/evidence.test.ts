// Ported from Perf Lab (PL/src/lang/evidence.test.ts); the hypothesis test now calls the package's
// evaluateHypothesis instead of the React view's.
import { describe, expect, it } from 'vitest';
import { build, evaluateHypothesis, selectImages, syntheticEnv, type BuildEnv, type DatasetInfo } from '../src/index.ts';

const DS = 'c435d426e9d2d44aff1fcdc457b1705612eca0bfa17c7aed4efbf035114df74c';
const ARCHIVE = '0daa394d641cfbec091824be41eb153dcc367ca9038d038ca7ee395926ef20c3';

const info: DatasetInfo = {
  id: DS,
  name: 'fixture',
  imageCount: 6,
  images: [101, 102, 103, 201, 202, 900].map((imageId) => ({ imageId, negative: imageId === 900, present: false })),
  provenance: {
    strata: [
      { category: 'person', size: 'small', image_ids: [102, 101] },
      { category: 'car', size: 'small', image_ids: [201, 202] },
    ],
    negative_ids: [900],
  },
};

const env = (archives: string[], datasets: DatasetInfo[]): BuildEnv => ({
  ...syntheticEnv(new Set()),
  archive: (sha) => archives.includes(sha),
  dataset: (sha) => datasets.find((d) => d.id === sha),
});

const program = (images: string, withEvidence = true) => `
return lab('dino evidence')
  .experiment('pr1005-dgx', e => e
    .host('playback@dgx')
    .workload(dino({ dataset: dataset('${DS}'), images: ${images}, labels: ['person', 'car'], precision: 'fp16', inputSize: 768 }))
    .baseline(rev('a6f14d947'))
    .candidate(rev('d59d9ad'))
    ${withEvidence ? `.evidence(archive('${ARCHIVE}'), { format: 'detection-qualification/v1' })` : ''}
    .repeat({ processes: 2 })
    .capture(capture.timing())
    .capture(capture.memory().states(['cold', 'warm', 'warm-repeat']))
    .capture(capture.predictions()));`;

const plan = (src: string, e: BuildEnv) => build({ source: src, labId: 't', params: {}, env: e }).ir.plan;

describe('image selections', () => {
  it('resolves all, stratified, negatives, a count and explicit ids', () => {
    expect(selectImages(info, 'all')).toEqual([101, 102, 103, 201, 202, 900]);
    expect(selectImages(info, 'stratified')).toEqual([102, 201, 900]);
    expect(selectImages(info, 'negatives')).toEqual([900]);
    expect(selectImages(info, 2)).toEqual([101, 102]);
    expect(selectImages(info, [202, 101, 101])).toEqual([101, 202]);
    expect(() => selectImages(info, [7])).toThrow(/not in dataset/);
  });
});

describe('evidence-backed captures', () => {
  it('are import when the archive is registered, with repetitions from the declaration', () => {
    const p = plan(program("'all'"), env([ARCHIVE], [info]));
    expect(p.captures.map((c) => [c.ref, c.status, c.reps])).toEqual([
      ['pr1005-dgx/baseline/timing', 'import', 2],
      ['pr1005-dgx/baseline/memory', 'import', 3],
      ['pr1005-dgx/baseline/predictions', 'import', 1],
      ['pr1005-dgx/candidate/timing', 'import', 2],
      ['pr1005-dgx/candidate/memory', 'import', 3],
      ['pr1005-dgx/candidate/predictions', 'import', 1],
    ]);
    expect(p.import).toBe(6);
    const lowered = p.captures[0]!.lowered as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(lowered.evidence).toEqual({ archive_sha256: ARCHIVE, format: 'detection-qualification/v1', reports: null });
    expect(lowered.workload).toMatchObject({ adapter: 'dino', dataset_sha256: DS, fixture_manifest_sha256: DS, image_selection: 'all', image_ids: [101, 102, 103, 201, 202, 900] });
  });

  it('are blocked, naming what is missing, when the archive or the dataset is not registered', () => {
    expect(plan(program("'all'"), env([], [info])).captures[0]).toMatchObject({ status: 'blocked', blockedOn: expect.stringMatching(/^evidence:0daa394d641c… not registered/) });
    expect(plan(program("'all'"), env([ARCHIVE], [])).captures[0]).toMatchObject({ status: 'blocked', blockedOn: expect.stringMatching(/^dataset:c435d426e9d2… not registered/) });
  });

  it('change identity with the image subset and with the archive, not otherwise', () => {
    const e = env([ARCHIVE], [info]);
    const all = plan(program("'all'"), e).captures[0]!.hash;
    expect(plan(program("'all'"), e).captures[0]!.hash).toBe(all);
    expect(plan(program("'stratified'"), e).captures[0]!.hash).not.toBe(all);
    const executed = plan(program("'all'", false), e).captures[0]!;
    expect(executed.hash).not.toBe(all);
    expect(executed.status).toBe('execute');
  });
});

describe('a server without evidence import', () => {
  it('blocks evidence captures with the reason instead of letting them run as synthetic', () => {
    const e = { ...env([ARCHIVE], [info]), evidenceBlocked: () => 'the running lab server predates evidence import; restart it (pnpm lab-server)' };
    expect(plan(program("'all'"), e).captures[0]).toMatchObject({ status: 'blocked', blockedOn: expect.stringMatching(/predates evidence import/) });
  });
});

describe('hypotheses over missing evidence', () => {
  it('are open, not supported, when the predicate returns a missing value', () => {
    const src = `
return lab('h')
  .derive('rows', q.requests('nothing/*/timing'), rs => [{ allExact: rs.length ? true : missing('no runs imported') }])
  .hypothesis('as-value', h => h.claim('x').predicts(q.read('rows'), r => r.allExact))
  .hypothesis('as-boolean', h => h.claim('y').predicts(q.read('rows'), r => r.allExact === true))
  .board('b', b => b.title('b'));`;
    const out = build({ source: src, labId: 'h', params: {}, env: syntheticEnv(new Set()) });
    const state = { params: {}, signals: {} };
    expect(evaluateHypothesis(out.registry, state, 'as-value').verdict).toBe('open');
    expect(evaluateHypothesis(out.registry, state, 'as-boolean').verdict).toBe('open');
  });
});
