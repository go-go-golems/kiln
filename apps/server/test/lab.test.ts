import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { captureHash, cyrb53, stableStringify } from '../src/lab/captures.ts';
import { archiveRoot, evidenceDir, mediaFile, sha256 } from '../src/lab/files.ts';
import { HOST, makeServer, tempDir } from './support/server.ts';
import { capture, cocoArchive, cocoManifest, IMAGES, insertMeasured, insertMedia, JPEG, tarGz } from './support/lab.ts';

const b64 = (x: Uint8Array) => Buffer.from(x).toString('base64');

function labServer() {
  const s = makeServer({ executors: [] });
  const events: { type: string; data: any }[] = [];
  s.bus.on((e) => events.push(e));
  return { ...s, events };
}

describe('capture identity (Perf Lab cyrb53)', () => {
  it('matches vectors computed with Perf Lab\'s own hash and stableStringify (PL/src/lang/util.ts)', () => {
    expect(cyrb53('')).toBe('bdcb81aee8d83');
    expect(cyrb53('a')).toBe('1c2ba782c97901');
    expect(cyrb53('hello', 7)).toBe('12779cb81098a8');
    expect(stableStringify({ b: 1, a: [1, 'x', null], c: { z: true, y: 'ü→' } })).toBe('{"a":[1,"x",null],"b":1,"c":{"y":"ü→","z":true}}');
    expect(captureHash({})).toBe('1bc27f5a56d1e7');
    expect(captureHash({ b: 1, a: [1, 'x', null], c: { z: true, y: 'ü→' } })).toBe('166d2fb354cb60');
    expect(captureHash({ schema_version: 1, experiment_id: 'sampler-test', arm: 'baseline', host: 'local', workload: { adapter: 'sampler', queries: 64 }, collection: { mode: 'timing', requests: 3 } })).toBe('1a1c0ecec2f625');
    expect(captureHash('plain')).toBe('75c3fd59f2249');
    expect(captureHash([3, { k: 'v' }])).toBe('17bb778259fccd');
    expect(stableStringify({ a: undefined, __fn1: 'dropped' })).toBe('{"a":null}');
  });
});

describe('/api/lab: catalog, seeds and bundles', () => {
  it('seeds synthetic captures, never an executing host or an evidence capture, and lists them in the catalog', async () => {
    const s = labServer();
    expect((await s.json('GET', '/api/lab/catalog')).body).toEqual({});
    const dgx = capture('baseline', { host: 'playback@dgx' });
    const r = await s.json('POST', '/api/lab/labs/sampler/seed', {
      body: { captures: [capture('baseline'), dgx, capture('candidate', { host: 'playback@dgx', evidence: 'abc' })] },
    });
    expect(r).toEqual({ status: 200, body: { seeded: 1 } });
    expect(s.events).toEqual([{ type: 'catalog.changed', data: { labId: 'sampler' } }]);
    const cat = (await s.json('GET', '/api/lab/catalog')).body;
    expect(cat).toEqual({ [dgx.hash]: { origin: 'synthetic', source: null, ref: 'sampler-test/baseline/timing', host: 'playback@dgx', reps: 2, labId: 'sampler', importedAt: expect.any(String) } });
    expect((await s.json('POST', '/api/lab/labs/sampler/seed', { body: { captures: [dgx] } })).body).toEqual({ seeded: 0 });
    expect(s.events).toHaveLength(1);
  });

  it('recomputes every capture hash: a forged one is 409, a malformed capture 400', async () => {
    const s = labServer();
    const c = capture('baseline', { host: 'playback@dgx' });
    const forged = await s.json('POST', '/api/lab/labs/l/seed', { body: { captures: [{ ...c, hash: 'deadbeef' }] } });
    expect(forged.status).toBe(409);
    expect(forged.body).toEqual({ error: 'spec_hash_mismatch', message: `spec of ${c.ref} hashes to ${c.hash}, not deadbeef`, ref: c.ref });
    for (const captures of [[], undefined, [{ ...c, ref: 'no-slashes' }], [{ ...c, reps: 0 }], [{ ...c, spec: null }], [{ ...c, reps: 65 }]]) {
      const r = await s.json('POST', '/api/lab/labs/l/seed', { body: { captures } });
      expect([r.status, r.body.error]).toEqual([400, 'bad_request']);
    }
    expect((await s.json('GET', '/api/lab/catalog')).body).toEqual({});
  });

  it('serves bundles by capture hash, repetitions in order, value records intact; unknown hashes are empty', async () => {
    const s = labServer();
    const a = capture('baseline');
    const b = capture('candidate');
    insertMeasured(s.db, 'sampler', a, [2, 2.5]);
    insertMeasured(s.db, 'sampler', b, [1]);
    const r = await s.json('GET', `/api/lab/bundles?hashes=${a.hash},${b.hash},nope`);
    expect(Object.keys(r.body)).toEqual([a.hash, b.hash, 'nope']);
    expect(r.body.nope).toEqual([]);
    expect(r.body[a.hash].map((x: any) => [x.run.ref, x.entities[0].latency])).toEqual([['sampler-test/baseline/timing#0', 2], ['sampler-test/baseline/timing#1', 2.5]]);
    expect(r.body[b.hash][0].entities[1].userTime).toEqual({ __value: true, v: 1.5, unit: 'ms', source: 'sampler-test/candidate/timing#0/cpu.json' });
    expect(r.body[b.hash][0].links).toEqual([expect.objectContaining({ rel: 'contains', evidence: 'direct' })]);
    expect((await s.json('GET', '/api/lab/catalog')).body[a.hash]).toEqual({ origin: 'measured', source: null, ref: a.ref, host: 'local', reps: 2, labId: 'sampler', importedAt: '2026-10-12T00:01:00.000Z' });
    const many = Array.from({ length: 70 }, (_, i) => `h${i}`).join(',');
    expect(Object.keys((await s.json('GET', `/api/lab/bundles?hashes=${many}`)).body)).toHaveLength(64);
    expect((await s.json('GET', '/api/lab/bundles')).body).toEqual({});
  });
});

describe('/api/lab: programs, annotations, jobs and hosts', () => {
  it('stores, returns and deletes an edited program', async () => {
    const s = labServer();
    expect((await s.json('GET', '/api/lab/programs/sampler')).status).toBe(404);
    expect((await s.json('PUT', '/api/lab/programs/sampler', { body: { source: 'lab("x")', presetHash: 'p1' } })).body).toEqual({ ok: true });
    expect((await s.json('GET', '/api/lab/programs/sampler')).body).toEqual({ labId: 'sampler', source: 'lab("x")', presetHash: 'p1', updatedAt: expect.any(String) });
    await s.json('PUT', '/api/lab/programs/sampler', { body: { source: 'lab("y")' } });
    expect((await s.json('GET', '/api/lab/programs/sampler')).body).toMatchObject({ source: 'lab("y")', presetHash: null });
    for (const body of [{}, { source: 3 }, { source: 'x'.repeat(500_001) }]) expect((await s.json('PUT', '/api/lab/programs/sampler', { body })).status).toBe(400);
    expect((await s.json('DELETE', '/api/lab/programs/sampler')).body).toEqual({ ok: true });
    expect((await s.json('GET', '/api/lab/programs/sampler')).body).toEqual({ error: 'not_found', message: 'no edited program' });
  });

  it('adds and lists annotations by lab', async () => {
    const s = labServer();
    const r = await s.json('POST', '/api/lab/annotations', { body: { labId: 'sampler', target: 'kernel:k1', kind: 'note', body: { text: 'slow' }, author: 'assistant' } });
    expect(r).toEqual({ status: 201, body: { id: 1 } });
    await s.json('POST', '/api/lab/annotations', { body: { labId: 'other', target: 't', kind: 'note', author: 'root' } });
    expect((await s.json('GET', '/api/lab/annotations?lab=sampler')).body).toEqual([
      { id: 1, lab_id: 'sampler', target: 'kernel:k1', kind: 'note', body: { text: 'slow' }, author: 'assistant', created_at: expect.any(String) },
    ]);
    expect((await s.json('GET', '/api/lab/annotations?lab=other')).body[0]).toMatchObject({ author: 'user', body: null });
    expect((await s.json('POST', '/api/lab/annotations', { body: { labId: 'x', kind: 'note' } })).status).toBe(400);
  });

  it('lists jobs read-only, in Perf Lab\'s JobView shape, and refuses to create, approve or cancel one', async () => {
    const s = labServer();
    expect((await s.json('GET', '/api/lab/jobs')).body).toEqual([]);
    s.db.prepare(`insert into lab_jobs values ('job-a', 'sampler', 'done', 'user', 'why', 'local', 3.8, 1, '2026-10-12T00:00:00Z', '2026-10-12T00:00:01Z', '2026-10-12T00:01:00Z', null)`).run();
    s.db.prepare(`insert into lab_job_captures values ('job-a', 'h1', 'e/a/timing', 'e', 'a', 'timing', 'local', 2, '{"secret":"spec"}', 'imported', null)`).run();
    s.db.prepare(`insert into lab_job_events (job_id, at, kind, detail) values ('job-a', '2026-10-12T00:00:00Z', 'job.proposed', 'why')`).run();
    const view = {
      id: 'job-a', lab_id: 'sampler', status: 'done', proposed_by: 'user', reason: 'why', hosts: 'local', budget_gpu_min: 3.8, progress: 1,
      created_at: '2026-10-12T00:00:00Z', approved_at: '2026-10-12T00:00:01Z', finished_at: '2026-10-12T00:01:00Z', error: null,
      captures: [{ job_id: 'job-a', hash: 'h1', ref: 'e/a/timing', experiment: 'e', arm: 'a', mode: 'timing', host: 'local', reps: 2, status: 'imported', error: null }],
      events: [{ id: 1, at: '2026-10-12T00:00:00Z', kind: 'job.proposed', detail: 'why' }],
    };
    expect((await s.json('GET', '/api/lab/jobs')).body).toEqual([view]);
    expect((await s.json('GET', '/api/lab/jobs?lab=sampler')).body).toEqual([view]);
    expect((await s.json('GET', '/api/lab/jobs?lab=other')).body).toEqual([]);
    expect((await s.json('GET', '/api/lab/jobs/job-a')).body).toEqual(view);
    expect((await s.json('GET', '/api/lab/jobs/job-b')).status).toBe(404);
    for (const path of ['/api/lab/jobs', '/api/lab/jobs/job-a/approve', '/api/lab/jobs/job-a/cancel']) {
      const r = await s.json('POST', path, { body: { labId: 'sampler', captures: [capture('baseline')], approve: true } });
      expect([path, r.status, r.body.error]).toEqual([path, 501, 'not_implemented']);
    }
    expect((await s.json('GET', '/api/lab/jobs/job-a')).body.status).toBe('done');
  });

  it('reports no host that executes lab jobs, and no local report without workload sources', async () => {
    const s = labServer();
    const hosts = (await s.json('GET', '/api/lab/hosts')).body;
    expect(hosts.map((h: any) => [h.host, h.executor, h.synthetic, h.available])).toEqual([
      ['local', 'none', false, false],
      ['playback@dgx', 'synthetic', true, true],
      ['playback@rtx-dev', 'synthetic', true, true],
    ]);
    expect(await s.json('GET', '/api/lab/hosts/local/capabilities')).toMatchObject({ status: 503, body: { error: 'no_probe' } });
    expect(await s.json('GET', '/api/lab/hosts/playback@dgx/capabilities')).toMatchObject({ status: 404, body: { error: 'not_found' } });
  });

  it("reports host local's workload revision as Perf Lab's probe computes it, from the sources' names and bytes", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'sampler.py'), 'import torch\n');
    writeFileSync(join(dir, 'bench.py'), 'def run():\n    return 1\n');
    writeFileSync(join(dir, 'notes.txt'), 'not python\n');
    const s = makeServer({ executors: [], config: { labWorkloads: dir } });
    const r = await s.json('GET', '/api/lab/hosts/local/capabilities');
    // computed with PL/workloads/perf_lab_local/probe.py's workloads_revision (Python hashlib) over the same files
    expect(r).toMatchObject({ status: 200, body: { host: 'local', synthetic: false, devices: ['cpu'], tools: { workloads: 'ddf321d31bc9' } } });
    writeFileSync(join(dir, 'bench.py'), 'def run():\n    return 2\n');
    expect((await s.json('GET', '/api/lab/hosts/local/capabilities')).body.tools.workloads).not.toBe('ddf321d31bc9');
  });
});

describe('/api/lab: evidence archives and datasets', () => {
  it('registers an archive uploaded as base64, by content, with its COCO selection as a dataset', async () => {
    const s = labServer();
    const gz = cocoArchive();
    const hash = sha256(gz);
    const r = await s.json('POST', '/api/lab/evidence', { body: { name: 'fixture', data: b64(gz) } });
    expect(r.status).toBe(201);
    const { datasetId } = cocoManifest();
    expect(r.body).toEqual({
      sha256: hash, name: 'fixture', bytes: gz.byteLength, addedAt: expect.any(String), datasets: [datasetId],
      files: [
        { path: 'qualification/coco/fixture-provenance.json', bytes: expect.any(Number) },
        { path: 'qualification/coco/instances_selected.json', bytes: expect.any(Number) },
        { path: 'qualification/reports/paired.json', bytes: 14 },
      ],
    });
    expect(s.events).toEqual([{ type: 'evidence.registered', data: { sha256: hash, name: 'fixture', datasets: [datasetId] } }]);
    expect(readFileSync(join(archiveRoot(s.config.dataDir, hash), 'qualification/reports/paired.json'), 'utf8')).toBe('{"results":[]}');
    expect(readFileSync(join(evidenceDir(s.config.dataDir), `${hash}.tar.gz`))).toEqual(Buffer.from(gz));

    const again = await s.json('POST', '/api/lab/evidence?name=again', { body: { data: b64(gz) } });
    expect([again.status, again.body.name]).toEqual([200, 'fixture']);
    expect(s.events).toHaveLength(1);
    expect((await s.json('GET', '/api/lab/evidence')).body).toEqual([r.body]);
    expect((await s.json('GET', `/api/lab/evidence/${hash}`)).body).toEqual(r.body);
    expect((await s.json('GET', `/api/lab/evidence/${'0'.repeat(64)}`)).status).toBe(404);

    expect((await s.json('GET', '/api/lab/datasets')).body).toEqual([
      { id: datasetId, name: 'fixture · COCO selection', format: 'coco', privacy: 'public', source: `evidence:${hash}`, categories: ['person', 'chair'], imageCount: 2, annotationCount: 2, present: 0, addedAt: r.body.addedAt },
    ]);
    const ds = (await s.json('GET', `/api/lab/datasets/${datasetId}`)).body;
    expect(ds.provenance.negative_ids).toEqual([7088]);
    expect(ds.images).toEqual([
      { imageId: 1993, fileName: '000000001993.jpg', sha256: sha256(IMAGES[1993]), width: 640, height: 419, license: 'Attribution License', licenseUrl: 'http://creativecommons.org/licenses/by/2.0/', sourceUrl: 'http://images.cocodataset.org/val2017/000000001993.jpg', pageUrl: 'http://example/1993', strata: [{ category: 'chair', size: 'large' }], negative: false, present: false },
      expect.objectContaining({ imageId: 7088, strata: [], negative: true, present: false, pageUrl: null }),
    ]);
    expect(ds.annotations).toEqual([
      { id: 1, imageId: 1993, label: 'chair', bboxPx: [111, 247.7, 118.5, 170.6], area: 20000, iscrowd: false },
      { id: 2, imageId: 7088, label: 'person', bboxPx: [10, 10, 50, 100], area: 5000, iscrowd: true },
    ]);
    insertMedia(s.db, s.config.dataDir, IMAGES[1993]);
    expect((await s.json('GET', `/api/lab/datasets/${datasetId}`)).body.images.map((i: any) => i.present)).toEqual([true, false]);
    expect((await s.json('GET', '/api/lab/datasets')).body[0].present).toBe(1);
    expect((await s.json('GET', '/api/lab/datasets/nope')).status).toBe(404);
    expect(await s.json('POST', `/api/lab/datasets/${datasetId}/materialize`)).toMatchObject({ status: 501, body: { error: 'not_implemented' } });
  });

  it('registers an archive by absolute path, and refuses any other request shape', async () => {
    const s = labServer();
    const dir = tempDir();
    const file = join(dir, 'evidence-final.tar.gz');
    writeFileSync(file, cocoArchive({ extra: '{"results":[1]}' }));
    const r = await s.json('POST', '/api/lab/evidence', { body: { name: 'by path', path: file } });
    expect([r.status, r.body.sha256, r.body.name]).toEqual([201, sha256(readFileSync(file)), 'by path']);
    writeFileSync(join(dir, 'archive.zip'), cocoArchive());
    writeFileSync(join(dir, 'notes.txt.tar.gz'), 'not gzip at all');
    const refusals: [unknown, number, string, RegExp][] = [
      [{ path: 'evidence-final.tar.gz' }, 400, 'bad_archive', /absolute/],
      [{ path: join(dir, 'archive.zip') }, 400, 'bad_archive', /\.tar\.gz or \.tgz/],
      [{ path: join(dir, 'missing.tar.gz') }, 400, 'bad_archive', /no file/],
      [{ path: dir + '.tar.gz' }, 400, 'bad_archive', /no file/],
      [{ path: join(dir, 'notes.txt.tar.gz') }, 400, 'bad_archive', /not gzip-compressed/],
      [{ path: 7 }, 400, 'bad_request', /string/],
      [{ name: 'x' }, 400, 'bad_request', /exactly one/],
      [{ data: b64(cocoArchive()), path: file }, 400, 'bad_request', /exactly one/],
      [{ data: 'not base64!' }, 400, 'bad_request', /base64/],
      [{ data: '' }, 400, 'bad_archive', /1 byte/],
      [[1, 2], 400, 'bad_request', /body must be/],
    ];
    for (const [body, status, error, message] of refusals) {
      const res = await s.json('POST', '/api/lab/evidence', { body });
      expect([JSON.stringify(body).slice(0, 60), res.status, res.body.error], res.body.message).toEqual([JSON.stringify(body).slice(0, 60), status, error]);
      expect(res.body.message).toMatch(message);
    }
    expect((await s.json('GET', '/api/lab/evidence')).body).toHaveLength(1);
  });

  it('refuses hostile and invalid archives, and leaves nothing behind', async () => {
    const s = labServer();
    const cases: [Uint8Array, RegExp][] = [
      [tarGz([{ path: 'link', type: '2' }]), /not a regular file or directory/],
      [tarGz([{ path: '../escape.json', data: 'x' }]), /leaves the archive directory/],
      [tarGz([{ path: 'a/../../escape.json', data: 'x' }]), /leaves the archive directory/],
      [tarGz([{ path: '/etc/passwd', data: 'x' }]), /absolute path/],
      [gzipSync(Buffer.from('plain text, gzip-compressed')), /not a tar archive/],
      [gzipSync(Buffer.alloc(1024)), /holds no files/],
      [tarGz([{ path: 'empty/', type: '5' }]), /holds no files/],
      [Buffer.from('PK\x03\x04 a zip file'), /not gzip-compressed/],
      [cocoArchive({ badHash: true }), /provenance records/],
      [cocoArchive({ host: 'camera.factory.local' }), /no public source/],
    ];
    for (const [gz, message] of cases) {
      const r = await s.json('POST', '/api/lab/evidence', { body: { data: b64(gz) } });
      expect([r.status, r.body.error]).toEqual([400, 'bad_archive']);
      expect(r.body.message).toMatch(message);
    }
    expect(existsSync(join(s.config.dataDir, 'escape.json')) || existsSync(join(s.config.dataDir, 'lab', 'escape.json'))).toBe(false);
    expect(existsSync(evidenceDir(s.config.dataDir)) ? readdirSync(evidenceDir(s.config.dataDir)) : []).toEqual([]);
    expect(s.db.prepare('select count(*) as n from lab_evidence_archives').get()).toEqual({ n: 0 });
    expect(s.db.prepare('select count(*) as n from lab_datasets').get()).toEqual({ n: 0 });
    expect(s.events).toEqual([]);
  });
});

describe('/api/lab/media/:sha', () => {
  it('serves a stored public image by its SHA-256, with its content type, cacheable for good', async () => {
    const s = labServer();
    const hash = insertMedia(s.db, s.config.dataDir, IMAGES[1993]);
    const r = await s.call('GET', `/api/lab/media/${hash}`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('image/jpeg');
    expect(r.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(IMAGES[1993]);
    // every other /api response stays uncached
    expect((await s.call('GET', '/api/lab/catalog')).headers.get('cache-control')).toBe('no-store');
    expect((await s.json('GET', `/api/lab/media/${sha256(JPEG('absent'))}`)).body.error).toBe('not_found');
  });

  it('refuses malformed hashes and every path traversal, and never serves a file outside the media store', async () => {
    const s = labServer();
    insertMedia(s.db, s.config.dataDir, IMAGES[1993]);
    writeFileSync(join(s.config.dataDir, 'secret.jpg'), 'secret');
    const secret = sha256(IMAGES[1993]).toUpperCase();
    const attempts = [
      'not-a-hash', secret, sha256(IMAGES[1993]).slice(1), `${sha256(IMAGES[1993])}0`, `${sha256(IMAGES[1993])}.jpg`,
      '..%2Fsecret.jpg', '..%2F..%2Fsecret.jpg', '%2e%2e%2f%2e%2e%2fsecret.jpg', '..%5c..%5csecret.jpg', '%00', 'kiln.sqlite',
      '..', '../../secret.jpg', '..%2F..%2Fkiln.sqlite',
    ];
    for (const a of attempts) {
      const r = await s.call('GET', `/api/lab/media/${a}`);
      expect([a, r.status === 400 || r.status === 404, r.headers.get('content-type')?.startsWith('image/')]).toEqual([a, true, false]);
      expect(await r.text()).not.toContain('secret');
    }
    expect((await s.json('GET', '/api/lab/media/..%2F..%2Fsecret.jpg')).body).toEqual({ error: 'bad_request', message: 'not a SHA-256 (64 lowercase hex digits)' });
  });

  it('answers 500, never wrong bytes, when a stored image no longer hashes to its name', async () => {
    const s = labServer();
    const hash = insertMedia(s.db, s.config.dataDir, IMAGES[7088]);
    writeFileSync(mediaFile(s.config.dataDir, hash, 'image/jpeg'), JPEG('tampered'));
    expect(await s.json('GET', `/api/lab/media/${hash}`)).toMatchObject({ status: 500, body: { error: 'corrupt_media' } });
  });

  it('the schema admits only public JPEG or PNG media named by a lowercase SHA-256', () => {
    const s = labServer();
    const ins = (sha: string, mime: string, privacy: string) =>
      s.db.prepare('insert into lab_media (sha256, bytes, mime, privacy, added_at) values (?, 1, ?, ?, ?)').run(sha, mime, privacy, 'now');
    const h = sha256('x');
    expect(() => ins(h, 'image/jpeg', 'private')).toThrow(/CHECK constraint/);
    expect(() => ins(h, 'text/html', 'public')).toThrow(/CHECK constraint/);
    expect(() => ins('../../kiln.sqlite', 'image/jpeg', 'public')).toThrow(/CHECK constraint/);
    expect(() => ins(h.toUpperCase(), 'image/jpeg', 'public')).toThrow(/CHECK constraint/);
    expect(() => ins(h, 'image/png', 'public')).not.toThrow();
    expect(() => mediaFile(s.config.dataDir, '../x', 'image/png')).toThrow(/not a SHA-256/);
  });
});

describe('/api/lab behind the four checks (guide §30.2)', () => {
  const s = labServer();
  const gets = ['/api/lab/catalog', '/api/lab/bundles?hashes=x', `/api/lab/media/${sha256('x')}`, '/api/lab/evidence', '/api/lab/datasets', '/api/lab/jobs', '/api/lab/hosts'];
  const writes: [string, string, unknown][] = [
    ['POST', '/api/lab/evidence', { data: b64(cocoArchive()) }],
    ['POST', '/api/lab/labs/l/seed', { captures: [capture('baseline', { host: 'playback@dgx' })] }],
    ['PUT', '/api/lab/programs/l', { source: 'x' }],
    ['DELETE', '/api/lab/programs/l', {}],
    ['POST', '/api/lab/annotations', { labId: 'l', target: 't', kind: 'k' }],
    ['POST', '/api/lab/jobs', {}],
  ];

  it('refuses a foreign Host and a foreign or null Origin on every lab route', async () => {
    for (const path of gets) {
      expect((await s.json('GET', path, { headers: { host: 'evil.example:5280' } })).body.error).toBe('bad_host');
      for (const origin of ['null', 'http://evil.example']) expect((await s.json('GET', path, { headers: { origin } })).body.error).toBe('bad_origin');
    }
    for (const [method, path, body] of writes) expect((await s.json(method, path, { body, headers: { host: 'rebind.example:5280' } })).body.error).toBe('bad_host');
  });

  it('refuses every lab write without the session token, or not as JSON, and changes nothing', async () => {
    for (const [method, path, body] of writes) {
      for (const token of [null, '0'.repeat(64)]) {
        const r = await s.json(method, path, { body, token });
        expect([method, path, r.status, r.body.error]).toEqual([method, path, 403, 'bad_token']);
      }
      const r = await s.json(method, path, { body, headers: { 'content-type': 'application/gzip' } });
      expect([method, path, r.status, r.body.error]).toEqual([method, path, 415, 'unsupported_media_type']);
    }
    expect((await s.json('GET', '/api/lab/evidence')).body).toEqual([]);
    expect((await s.json('GET', '/api/lab/catalog')).body).toEqual({});
    expect((await s.json('GET', '/api/lab/annotations?lab=l')).body).toEqual([]);
    expect(s.events).toEqual([]);
  });

  it('answers an unknown lab route with 404, and accepts the page\'s own origin', async () => {
    // Hono runs notFound on the top-level app only, so unknown /api paths get the page's text 404 (as before this phase)
    expect((await s.call('GET', '/api/lab/nope')).status).toBe(404);
    expect((await s.call('GET', '/api/lab/catalog', { headers: { origin: `http://${HOST}` } })).status).toBe(200);
  });
});
