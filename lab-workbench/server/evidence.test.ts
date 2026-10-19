import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { loadConfig } from './config';
import { getDataset, publicFetchUrl, sha256, type Fetcher } from './datasets';
import { all, openDb } from './db';
import { EventBus } from './events';
import { registerArchive } from './evidence';
import { Runner } from './runner';
import { readTarGz, writeTar } from './tar';

const JPEG = (tag: string) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new TextEncoder().encode(tag), 0xff, 0xd9]);
const IMAGES = { 1993: JPEG('chair'), 7088: JPEG('dog') };

/** A two-image COCO selection with the provenance shape of the DGX archive. */
function cocoFixture(opts: { badHash?: boolean; host?: string } = {}) {
  const manifest = JSON.stringify({
    licenses: [{ id: 4, name: 'Attribution License', url: 'http://creativecommons.org/licenses/by/2.0/' }],
    categories: [{ id: 1, name: 'person' }, { id: 62, name: 'chair' }],
    images: [
      { id: 1993, file_name: '000000001993.jpg', width: 640, height: 419, license: 4, coco_url: `http://${opts.host ?? 'images.cocodataset.org'}/val2017/000000001993.jpg`, flickr_url: 'http://example/1993' },
      { id: 7088, file_name: '000000007088.jpg', width: 500, height: 375, license: 4, coco_url: `http://${opts.host ?? 'images.cocodataset.org'}/val2017/000000007088.jpg` },
    ],
    annotations: [
      { id: 1, image_id: 1993, category_id: 62, bbox: [111, 247.7, 118.5, 170.6], area: 20000, iscrowd: 0 },
      { id: 2, image_id: 7088, category_id: 1, bbox: [10, 10, 50, 100], area: 5000, iscrowd: 1 },
    ],
  });
  const provenance = {
    seed: 20261009,
    selected_manifest_sha256: opts.badHash ? '0'.repeat(64) : sha256(manifest),
    strata: [{ category: 'chair', size: 'large', image_ids: [1993] }],
    negative_ids: [7088],
    image_hashes: [
      { id: 1993, file_name: '000000001993.jpg', sha256: sha256(IMAGES[1993]) },
      { id: 7088, file_name: '000000007088.jpg', sha256: sha256(IMAGES[7088]) },
    ],
  };
  return gzipSync(
    writeTar([
      { path: 'qualification/coco/', type: '5' },
      { path: 'qualification/coco/instances_selected.json', data: manifest },
      { path: 'qualification/coco/fixture-provenance.json', data: JSON.stringify(provenance) },
      { path: 'qualification/reports/paired.json', data: '{"results":[]}' },
    ]),
  );
}

function harness(fetcher?: Fetcher) {
  const dataDir = mkdtempSync(join(tmpdir(), 'perf-lab-evidence-'));
  const db = openDb(':memory:');
  const bus = new EventBus();
  const events: { type: string; data: unknown }[] = [];
  bus.on((e) => events.push(e));
  const app = createApp({ config: loadConfig({ dataDir }), db, bus, runner: new Runner(db, bus, {}), probe: () => undefined, startedAt: 'now', fetcher });
  const req = async (method: string, path: string, body?: Uint8Array) => {
    const res = await app.request(`/api${path}`, { method, body: body as BodyInit | undefined, headers: body ? { 'content-type': 'application/gzip' } : {} });
    const type = res.headers.get('content-type') ?? '';
    return { status: res.status, type, json: type.includes('json') ? ((await res.json()) as any) : null, bytes: type.includes('json') ? null : new Uint8Array(await res.arrayBuffer()) }; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
  return { db, dataDir, req, events, settle: () => new Promise((r) => setTimeout(r, 20)) };
}

describe('tar reader', () => {
  it('refuses links, absolute paths and parent references, and accepts regular files', () => {
    expect(readTarGz(gzipSync(writeTar([{ path: 'a/b.json', data: '{}' }]))).map((e) => e.path)).toEqual(['a/b.json']);
    expect(() => readTarGz(gzipSync(writeTar([{ path: 'link', type: '2' }])))).toThrow(/not a regular file or directory/);
    expect(() => readTarGz(gzipSync(writeTar([{ path: '../escape.json', data: 'x' }])))).toThrow(/leaves the archive directory/);
    expect(() => readTarGz(gzipSync(writeTar([{ path: '/etc/passwd', data: 'x' }])))).toThrow(/absolute path/);
    const corrupt = writeTar([{ path: 'a.json', data: '{}' }]);
    corrupt[10] ^= 0xff;
    expect(() => readTarGz(gzipSync(corrupt))).toThrow(/checksum/);
  });
});

describe('evidence archives and datasets', () => {
  it('registers an archive by hash, extracts its files and registers the COCO selection it contains', async () => {
    const h = harness();
    const gz = cocoFixture();
    const r = await h.req('POST', '/evidence?name=fixture', gz);
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ sha256: sha256(gz), name: 'fixture', bytes: gz.byteLength });
    expect(r.json.files.map((f: { path: string }) => f.path)).toEqual([
      'qualification/coco/fixture-provenance.json',
      'qualification/coco/instances_selected.json',
      'qualification/reports/paired.json',
    ]);
    expect(r.json.datasets).toHaveLength(1);
    expect((await h.req('POST', '/evidence?name=again', gz)).status).toBe(200); // idempotent by content
    const ds = await h.req('GET', `/datasets/${r.json.datasets[0]}`);
    expect(ds.json).toMatchObject({ format: 'coco', privacy: 'public', imageCount: 2, annotationCount: 2, present: 0, categories: ['person', 'chair'] });
    expect(ds.json.images[0]).toMatchObject({ imageId: 1993, width: 640, height: 419, strata: [{ category: 'chair', size: 'large' }], negative: false, license: 'Attribution License' });
    expect(ds.json.images[1]).toMatchObject({ imageId: 7088, negative: true });
    expect(ds.json.annotations[1]).toMatchObject({ id: 2, label: 'person', iscrowd: true, bboxPx: [10, 10, 50, 100] });
  });

  it('rejects a manifest whose hash differs from its provenance, and images without a public source', () => {
    const h = harness();
    expect(() => registerArchive(h.db, h.dataDir, cocoFixture({ badHash: true }), 'bad')).toThrow(/provenance records/);
    expect(() => registerArchive(h.db, h.dataDir, cocoFixture({ host: 'camera.factory.local' }), 'private')).toThrow(/no public source/);
    expect(all(h.db, 'select * from evidence_archives')).toEqual([]);
    expect(all(h.db, 'select * from datasets')).toEqual([]);
  });

  it('maps COCO URLs to the S3 path-style source and refuses other hosts', () => {
    expect(publicFetchUrl('http://images.cocodataset.org/val2017/000000001993.jpg')).toBe('https://s3.amazonaws.com/images.cocodataset.org/val2017/000000001993.jpg');
    expect(publicFetchUrl('http://images.cocodataset.org/../secret.jpg')).toBeNull();
    expect(publicFetchUrl('https://example.com/val2017/1.jpg')).toBeNull();
  });

  it('materializes images only when their bytes match the recorded hash, and serves only stored public media', async () => {
    const fetched: string[] = [];
    const h = harness(async (url) => {
      fetched.push(url);
      const bytes = url.endsWith('1993.jpg') ? IMAGES[1993] : JPEG('tampered');
      return { ok: true, status: 200, arrayBuffer: async () => bytes.slice().buffer };
    });
    const r = await h.req('POST', '/evidence?name=fixture', cocoFixture());
    const id = r.json.datasets[0] as string;
    expect((await h.req('POST', `/datasets/${id}/materialize`)).status).toBe(202);
    await h.settle();
    const done = h.events.find((e) => e.type === 'dataset.materialized')?.data as { fetched: number; failed: { imageId: number; reason: string }[] };
    expect(done.fetched).toBe(1);
    expect(done.failed).toEqual([{ imageId: 7088, reason: expect.stringMatching(/the dataset records/) }]);
    expect(fetched.every((u) => u.startsWith('https://s3.amazonaws.com/images.cocodataset.org/val2017/'))).toBe(true);
    expect(getDataset(h.db, id)!.images.map((i) => i.present)).toEqual([true, false]);
    const media = await h.req('GET', `/media/${sha256(IMAGES[1993])}`);
    expect(media.status).toBe(200);
    expect(media.type).toBe('image/jpeg');
    expect(media.bytes).toEqual(IMAGES[1993]);
    expect((await h.req('GET', `/media/${sha256(JPEG('tampered'))}`)).status).toBe(404);
    expect((await h.req('GET', '/media/not-a-hash')).status).toBe(400);
  });

  it('refuses any media privacy class but public at the schema', () => {
    const h = harness();
    expect(() => h.db.prepare(`insert into media (sha256, bytes, mime, privacy, added_at) values ('x', 1, 'image/jpeg', 'private', 'now')`).run()).toThrow(/CHECK constraint/);
  });

  const DGX = join(homedir(), 'code/tulip/playback-vault/Projects/2026/10/12/_assets/pr1005-dgx-20261012/evidence-final.tar.gz');
  it.skipIf(!existsSync(DGX))('registers the PR 1005 DGX archive with its 128-image selection', () => {
    const h = harness();
    const { archive } = registerArchive(h.db, h.dataDir, readFileSync(DGX), 'pr1005-dgx-20261012');
    expect(archive.sha256).toBe('0daa394d641cfbec091824be41eb153dcc367ca9038d038ca7ee395926ef20c3');
    expect(archive.files).toHaveLength(55);
    expect(archive.datasets).toEqual(['c435d426e9d2d44aff1fcdc457b1705612eca0bfa17c7aed4efbf035114df74c']);
    const ds = getDataset(h.db, archive.datasets[0])!;
    expect([ds.imageCount, ds.annotationCount, ds.images.filter((i) => i.negative).length]).toEqual([128, 799, 8]);
    expect(ds.images.find((i) => i.imageId === 1993)).toMatchObject({ sha256: '039f3bfb862023bde7f835a36c32d8f59a3e66488863c2a47b7b746e78c44186', width: 640, height: 419 });
  });
});
