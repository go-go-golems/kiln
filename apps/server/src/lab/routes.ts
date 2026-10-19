// Perf Lab's server routes as the Kiln server's second route group (guide §33.3), mounted at /api/lab. Every route
// answers with the shape Perf Lab's own route answers with (PL/server/app.ts), so a Perf Lab client needs only a
// base-path change. The group sits behind Kiln's checks (security.ts): Host and Origin on every request, the session
// token and a JSON body on every write — which is why an evidence archive is uploaded as base64 in JSON, or named by
// a local path, rather than sent as a raw .tar.gz body.
//
// Not ported: lab job execution (the job routes are read-only; creating, approving or cancelling answers 501),
// dataset materialization (no outbound fetch; media come from the importer), and the assistant. Host `local`'s report
// is read, not probed (probe.ts).
import { Hono, type Context } from 'hono';
import type { ServerConfig } from '../config.ts';
import type { Db } from '../db.ts';
import type { EventBus } from '../events.ts';
import { validateCaptures } from './captures.ts';
import { localReport } from './probe.ts';
import { getDataset, listDatasets, readMedia } from './datasets.ts';
import { getArchive, listArchives, MAX_ARCHIVE_BYTES, readArchivePath, registerArchive } from './evidence.ts';
import { addAnnotation, bundlesFor, catalog, deleteProgram, getJob, getProgram, listAnnotations, listJobs, MAX_BUNDLE_HASHES, MAX_PROGRAM_CHARS, putProgram, seedSynthetic } from './store.ts';

export interface LabContext {
  config: Pick<ServerConfig, 'dataDir' | 'labWorkloads'>;
  db: Db;
  bus: EventBus;
}

/** Hosts that execute lab work and so are never seeded with synthetic stand-ins: Perf Lab's process executor. */
export const EXECUTABLE_HOSTS = new Set(['local']);
const SYNTHETIC_HOSTS = ['playback@dgx', 'playback@rtx-dev'];
const NO_EXECUTION = 'lab jobs do not run on the Kiln server yet (KILN-001 Phase 8c ports data, not execution)';

const err = (error: string, message: string, extra: Record<string, unknown> = {}) => ({ error, message, ...extra });
const readJson = (c: Context): Promise<unknown> => c.req.json().catch(() => undefined);
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

export function labRoutes({ config, db, bus }: LabContext): Hono {
  const lab = new Hono();
  const notExecuted = (c: Context) => c.json(err('not_implemented', NO_EXECUTION), 501);

  // ── hosts: nothing executes here, so no host is available for lab jobs; local's report is read, not probed ────────────────────
  lab.get('/hosts', (c) =>
    c.json([
      { host: 'local', executor: 'none', synthetic: false, available: false, error: NO_EXECUTION },
      ...SYNTHETIC_HOSTS.map((host) => ({ host, executor: 'synthetic', synthetic: true, available: true })),
    ]),
  );
  lab.get('/hosts/:host/capabilities', (c) => {
    const host = c.req.param('host');
    if (host !== 'local') return c.json(err('not_found', `the server has no probe for ${host}; its report is synthetic and lives in the client`), 404);
    const r = localReport(config.labWorkloads);
    return 'error' in r ? c.json(err('no_probe', r.error), 503) : c.json(r);
  });

  // ── programs: edited lab.js sources ──────────────────────────────────────────────────────────────────────────────
  lab.get('/programs/:labId', (c) => {
    const p = getProgram(db, c.req.param('labId'));
    return p ? c.json({ labId: p.lab_id, source: p.source, presetHash: p.preset_hash, updatedAt: p.updated_at }) : c.json(err('not_found', 'no edited program'), 404);
  });
  lab.put('/programs/:labId', async (c) => {
    const body = await readJson(c);
    if (!isObj(body) || typeof body.source !== 'string' || body.source.length > MAX_PROGRAM_CHARS) return c.json(err('bad_request', 'source must be a string up to 500 kB'), 400);
    putProgram(db, c.req.param('labId'), body.source, typeof body.presetHash === 'string' ? body.presetHash : null);
    return c.json({ ok: true });
  });
  lab.delete('/programs/:labId', (c) => {
    deleteProgram(db, c.req.param('labId'));
    return c.json({ ok: true });
  });

  // ── catalog, synthetic seeds and bundles ─────────────────────────────────────────────────────────────────────────
  lab.get('/catalog', (c) => c.json(catalog(db)));
  lab.post('/labs/:labId/seed', async (c) => {
    const body = await readJson(c);
    const v = validateCaptures(isObj(body) ? body.captures : undefined);
    if (!v.ok) return c.json(err(v.error, v.message, v.ref ? { ref: v.ref } : {}), v.status);
    const labId = c.req.param('labId');
    const seeded = seedSynthetic(db, labId, v.captures, (h) => EXECUTABLE_HOSTS.has(h));
    if (seeded) bus.emit('catalog.changed', { labId });
    return c.json({ seeded });
  });
  lab.get('/bundles', (c) => {
    const hashes = (c.req.query('hashes') ?? '').split(',').filter(Boolean).slice(0, MAX_BUNDLE_HASHES);
    const out: Record<string, unknown> = {};
    for (const h of hashes) out[h] = bundlesFor(db, h);
    return c.json(out);
  });

  // ── jobs: the history imported from Perf Lab, read-only ──────────────────────────────────────────────────────────
  lab.get('/jobs', (c) => c.json(listJobs(db, c.req.query('lab') || undefined)));
  lab.get('/jobs/:id', (c) => {
    const j = getJob(db, c.req.param('id'));
    return j ? c.json(j) : c.json(err('not_found', 'no such job'), 404);
  });
  lab.post('/jobs', notExecuted);
  lab.post('/jobs/:id/approve', notExecuted);
  lab.post('/jobs/:id/cancel', notExecuted);

  // ── annotations: heuristic notes on entities ─────────────────────────────────────────────────────────────────────
  lab.get('/annotations', (c) => c.json(listAnnotations(db, c.req.query('lab') ?? '')));
  lab.post('/annotations', async (c) => {
    const b = await readJson(c);
    if (!isObj(b) || typeof b.labId !== 'string' || typeof b.target !== 'string' || typeof b.kind !== 'string') return c.json(err('bad_request', 'labId, target and kind are required'), 400);
    const id = addAnnotation(db, { labId: b.labId, target: b.target, kind: b.kind, body: b.body ?? null, author: b.author === 'assistant' ? 'assistant' : 'user' });
    return c.json({ id }, 201);
  });

  // ── evidence archives ────────────────────────────────────────────────────────────────────────────────────────────
  lab.get('/evidence', (c) => c.json(listArchives(db)));
  lab.get('/evidence/:sha', (c) => {
    const a = getArchive(db, c.req.param('sha'));
    return a ? c.json(a) : c.json(err('not_found', 'no such archive'), 404);
  });
  /** {name?, data: base64 of the .tar.gz} or {name?, path: absolute path of a local .tar.gz}; 201 new, 200 known. */
  lab.post('/evidence', async (c) => {
    const body = await readJson(c);
    if (!isObj(body)) return c.json(err('bad_request', 'the body must be {"name"?, "data": base64} or {"name"?, "path": "/abs/archive.tar.gz"}'), 400);
    const { data, path } = body;
    if ((data === undefined) === (path === undefined)) return c.json(err('bad_request', 'give exactly one of data (base64 of the archive) and path (an absolute path on this machine)'), 400);
    const name = (typeof body.name === 'string' ? body.name : (c.req.query('name') ?? '')).trim().slice(0, 120) || 'evidence';
    let bytes: Uint8Array;
    try {
      if (data !== undefined) {
        if (typeof data !== 'string' || data.length % 4 !== 0 || !BASE64.test(data)) return c.json(err('bad_request', 'data must be standard base64'), 400);
        if ((data.length / 4) * 3 > MAX_ARCHIVE_BYTES + 2) return c.json(err('too_large', `archives are limited to ${MAX_ARCHIVE_BYTES} bytes`), 413);
        bytes = Buffer.from(data, 'base64');
      } else {
        if (typeof path !== 'string') return c.json(err('bad_request', 'path must be a string'), 400);
        bytes = readArchivePath(path);
      }
      const r = registerArchive(db, config.dataDir, bytes, name);
      if (r.created) bus.emit('evidence.registered', { sha256: r.archive.sha256, name: r.archive.name, datasets: r.archive.datasets });
      return c.json(r.archive, r.created ? 201 : 200);
    } catch (e) {
      return c.json(err('bad_archive', (e as Error).message), 400);
    }
  });

  // ── datasets and media ───────────────────────────────────────────────────────────────────────────────────────────
  lab.get('/datasets', (c) => c.json(listDatasets(db)));
  lab.get('/datasets/:id', (c) => {
    const d = getDataset(db, c.req.param('id'));
    return d ? c.json(d) : c.json(err('not_found', 'no such dataset'), 404);
  });
  lab.post('/datasets/:id/materialize', (c) =>
    c.json(err('not_implemented', 'the Kiln server does not fetch dataset images; import them with their dataset (pnpm --filter @kiln/server lab:import)'), 501),
  );
  lab.get('/media/:sha', (c) => {
    const m = readMedia(db, config.dataDir, c.req.param('sha'));
    if (!m.ok) return c.json(err(m.error, m.reason), m.status);
    // content-addressed and verified: the bytes behind this URL can never change
    return c.body(new Uint8Array(m.data), 200, { 'content-type': m.row.mime, 'cache-control': 'public, max-age=31536000, immutable' });
  });

  return lab;
}
