// Perf Lab's data routes, mounted at /api/lab: programs, the catalog and bundles, annotations, datasets and media, in
// the shapes Perf Lab's own routes answer with (PL/server/app.ts). Lab jobs, hosts and archives are not here: a lab
// program's captures run through the one job API (/api/jobs), hosts are /api/hosts, and archives /api/archives
// (KILN-003 guide §28.1). The group sits behind Kiln's checks (security.ts).
//
// Not ported: dataset materialization (no outbound fetch; media come from the importer) and the assistant.
import { Hono, type Context } from 'hono';
import type { ServerConfig } from '../config.ts';
import type { Db } from '../db.ts';
import { getDataset, listDatasets, readMedia } from './datasets.ts';
import { addAnnotation, bundlesFor, catalog, deleteProgram, getProgram, listAnnotations, MAX_BUNDLE_HASHES, MAX_PROGRAM_CHARS, putProgram } from './store.ts';

export interface LabContext {
  config: Pick<ServerConfig, 'dataDir'>;
  db: Db;
}

const err = (error: string, message: string, extra: Record<string, unknown> = {}) => ({ error, message, ...extra });
const readJson = (c: Context): Promise<unknown> => c.req.json().catch(() => undefined);
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

export function labRoutes({ config, db }: LabContext): Hono {
  const lab = new Hono();

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

  // ── catalog and bundles ─────────────────────────────────────────────────────────────────────────
  lab.get('/catalog', (c) => c.json(catalog(db)));
  lab.get('/bundles', (c) => {
    const hashes = (c.req.query('hashes') ?? '').split(',').filter(Boolean).slice(0, MAX_BUNDLE_HASHES);
    const out: Record<string, unknown> = {};
    for (const h of hashes) out[h] = bundlesFor(db, h);
    return c.json(out);
  });

  // ── annotations: heuristic notes on entities ─────────────────────────────────────────────────────────────────────
  lab.get('/annotations', (c) => c.json(listAnnotations(db, c.req.query('lab') ?? '')));
  lab.post('/annotations', async (c) => {
    const b = await readJson(c);
    if (!isObj(b) || typeof b.labId !== 'string' || typeof b.target !== 'string' || typeof b.kind !== 'string') return c.json(err('bad_request', 'labId, target and kind are required'), 400);
    const id = addAnnotation(db, { labId: b.labId, target: b.target, kind: b.kind, body: b.body ?? null, author: b.author === 'assistant' ? 'assistant' : 'user' });
    return c.json({ id }, 201);
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
