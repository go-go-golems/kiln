// The injected data layer: a MemoryLabData filled with the /api/lab routes' JSON, labEnv over it, revived values,
// sealed entities, dataset entities.
import { describe, expect, it } from 'vitest';
import {
  build,
  bundlesNeeded,
  createMemoryLabData,
  datasetProvider,
  evidenceBlockedBy,
  indexDataset,
  isValue,
  labEnv,
  ProvenanceError,
  readDerive,
  revive,
  type BundleJSON,
  type DatasetDetail,
  type HostReport,
  type PairedRatioResult,
} from '../src/index.ts';
import { PERF_LAB_SAMPLER } from './fixtures/perf-lab-sampler.ts';
import fixture from './fixtures/local-sampler-q2048.json' with { type: 'json' };

const SOURCE = PERF_LAB_SAMPLER;
const state = { params: {}, signals: {} };
const bundles = fixture.bundles as unknown as Record<string, BundleJSON[]>;
const catalog = fixture.catalog as Record<string, { origin: 'measured' }>;
const localReport = fixture.localReport as HostReport;

describe('revive', () => {
  it('rebuilds JSON value records as evidence Values, at any depth', () => {
    const x = revive({ a: [{ m: { __value: true, value: 3, prov: 'observed', unit: 'ms' } }] });
    const v = x.a[0]!.m as unknown as { value: number; prov: string; unit: string };
    expect(isValue(v)).toBe(true);
    expect(+v).toBe(3);
    expect(v).toMatchObject({ value: 3, prov: 'observed', unit: 'ms' });
  });

  it('keeps a missing value’s reason and never turns an unknown-class value into data', () => {
    const m = revive({ __value: true, value: null, prov: 'unknown', reason: 'nvidia-smi reported [N/A]', unit: 'MHz' }) as unknown as { value: unknown; reason: string; unit: string };
    expect(m).toMatchObject({ value: null, reason: 'nvidia-smi reported [N/A]', unit: 'MHz' });
    const u = revive({ __value: true, value: 5, prov: 'unknown' }) as unknown as { value: unknown; reason: string };
    expect(u.value).toBeNull();
    expect(u.reason).toMatch(/value of unknown provenance: 5/);
  });
});

describe('a MemoryLabData filled from the routes', () => {
  it('shows a measured capture only once its bundles are loaded', () => {
    const data = createMemoryLabData({ catalog: fixture.catalog as never, hostReports: { local: localReport } });
    const env = labEnv(data);
    const first = build({ source: SOURCE, labId: 'l', params: {}, env });
    expect(first.ir.plan.captures.filter((c) => c.status === 'cached').map((c) => c.ref).sort()).toEqual([
      'sampler-local/baseline/memory',
      'sampler-local/baseline/timing',
      'sampler-local/candidate/memory',
      'sampler-local/candidate/timing',
    ]);
    // available in the catalog, but no runs to read yet
    expect(bundlesNeeded(first.ir, data).sort()).toEqual(Object.keys(catalog).sort());
    expect((readDerive(first.registry, 'speedup', state) as PairedRatioResult).median.value).toBeNull();

    data.addBundles(bundles);
    expect(bundlesNeeded(first.ir, data)).toEqual([]);
    const second = build({ source: SOURCE, labId: 'l', params: {}, env });
    const est = readDerive(second.registry, 'speedup', state) as PairedRatioResult;
    expect(est.pairs).toHaveLength(4);
  });

  it('remembers a hash with no bundles as loaded, and forgets one on drop', () => {
    const data = createMemoryLabData();
    data.addBundles({ deadbeef: [] });
    expect(data.bundlesLoaded('deadbeef')).toBe(true);
    expect(data.bundleRun('deadbeef', 0)).toBeUndefined();
    data.dropBundles('deadbeef');
    expect(data.bundlesLoaded('deadbeef')).toBe(false);
  });

  it('blocks evidence import only for a server whose features lack it', () => {
    expect(evidenceBlockedBy(null)).toBeUndefined();
    expect(evidenceBlockedBy(['evidence-import'])).toBeUndefined();
    expect(evidenceBlockedBy(['datasets'])).toMatch(/predates evidence import/);
    const data = createMemoryLabData({ features: ['datasets'] });
    expect(labEnv(data).evidenceBlocked?.()).toMatch(/predates evidence import/);
    data.setFeatures(['evidence-import']);
    expect(labEnv(data).evidenceBlocked?.()).toBeUndefined();
  });

  it('reads the local host report when a build asks, not when the environment is made', () => {
    const data = createMemoryLabData({ catalog: fixture.catalog as never });
    const env = labEnv(data);
    expect(() => env.capabilities('local')).toThrow(/no capability report for host "local"/);
    data.setHostReports({ local: localReport });
    expect(env.capabilities('local').tools.workloads).toBe('1fc6b670a8a6');
  });
});

describe('entities', () => {
  it('are sealed all the way down (P-6)', () => {
    const data = createMemoryLabData({ catalog: fixture.catalog as never, bundles, hostReports: { local: localReport } });
    const { registry } = build({ source: SOURCE, labId: 'l', params: {}, env: labEnv(data) });
    const run = registry.source.runs('sampler-local/candidate/timing#0')[0]!;
    expect(() => {
      (run as Record<string, unknown>).arm = 'baseline';
    }).toThrow(ProvenanceError);
    expect(() => {
      (run.validity as Record<string, unknown>).ok = false;
    }).toThrow(ProvenanceError);
    expect(() => Object.defineProperty(run, 'x', { value: 1 })).toThrow(ProvenanceError);
  });
});

describe('datasets', () => {
  const DS = 'c435d426e9d2d44aff1fcdc457b1705612eca0bfa17c7aed4efbf035114df74c';
  const detail: DatasetDetail = {
    id: DS,
    name: 'fixture',
    format: 'coco',
    privacy: 'public',
    source: 'evidence:0daa',
    categories: ['person'],
    imageCount: 2,
    annotationCount: 2,
    present: 1,
    provenance: { strata: [{ category: 'person', size: 'small', image_ids: [1] }], negative_ids: [2] },
    images: [
      { imageId: 1, fileName: '1.jpg', sha256: 'a'.repeat(64), width: 200, height: 100, license: null, licenseUrl: null, sourceUrl: 'x', pageUrl: null, strata: [{ category: 'person', size: 'small' }], negative: false, present: true },
      { imageId: 2, fileName: '2.jpg', sha256: 'b'.repeat(64), width: 100, height: 100, license: null, licenseUrl: null, sourceUrl: 'y', pageUrl: null, strata: [], negative: true, present: false },
    ],
    annotations: [
      { id: 10, imageId: 1, label: 'person', bboxPx: [20, 10, 40, 30], area: 1200, iscrowd: false },
      { id: 11, imageId: 1, label: 'person', bboxPx: [0, 0, 200, 100], area: 20000, iscrowd: true },
    ],
  };

  it('become image and annotation entities with normalized boxes and media URLs', () => {
    const ix = indexDataset(detail);
    expect(ix.image.map((i) => [i.ref, i.annotations, i.mediaUrl, i.strata])).toEqual([
      ['dataset:c435d426!image:1', 1, `/api/lab/media/${'a'.repeat(64)}`, 'person/small'],
      ['dataset:c435d426!image:2', 0, null, 'negative'],
    ]);
    expect(ix.annotation[0]).toMatchObject({ ref: 'dataset:c435d426!annotation:10', bbox: [0.1, 0.1, 0.3, 0.4], size: 'medium' });
  });

  it('are found by a manifest-hash prefix of at least 8 hex', () => {
    const p = datasetProvider(() => [detail], (sha) => `/m/${sha.slice(0, 4)}`);
    expect(p.entities('image', 'dataset:c435d426')).toHaveLength(2);
    expect(p.entities('image', 'c435')).toEqual([]);
    expect(p.entity('dataset:c435d426!image:1')?.mediaUrl).toBe('/m/aaaa');
  });
});
