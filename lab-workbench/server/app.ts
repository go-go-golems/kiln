import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { hash, stableStringify } from '../src/lang/util';
import type { AssistantService } from './assistant/service';
import type { ServerConfig } from './config';
import { getDataset, listDatasets, materialize, readMedia, type Fetcher } from './datasets';
import { get, now, type Db } from './db';
import type { EventBus } from './events';
import { getArchive, listArchives, MAX_ARCHIVE_BYTES, registerArchive } from './evidence';
import type { ProbeResult } from './probe';
import type { Runner } from './runner';
import {
  addAnnotation,
  addJobEvent,
  bundlesFor,
  createJob,
  deleteProgram,
  getJob,
  getJobRow,
  getProgram,
  listAnnotations,
  listArtifacts,
  listJobs,
  putProgram,
  seedSynthetic,
  updateJob,
  type CaptureInput,
} from './store';

export interface AppContext {
  config: ServerConfig;
  db: Db;
  bus: EventBus;
  runner: Runner;
  probe: () => ProbeResult | undefined;
  assistant?: AssistantService;
  startedAt: string;
  /** injected by tests; dataset materialization uses fetch otherwise */
  fetcher?: Fetcher;
}

const SYNTHETIC_HOSTS = ['playback@dgx', 'playback@rtx-dev'];

/** Advertised in /health. evidence-import: captures with spec.evidence are read from archives, never synthesized. */
export const SERVER_FEATURES = ['evidence-import', 'datasets', 'media'];

const err = (code: string, message: string, extra: Record<string, unknown> = {}) => ({ error: code, message, ...extra });

/** Captures arrive with their lowered spec; the hash is recomputed so content addressing cannot be forged. */
function validateCaptures(raw: unknown): { ok: true; captures: CaptureInput[] } | { ok: false; body: ReturnType<typeof err> } {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, body: err('bad_request', 'captures must be a non-empty array') };
  const captures: CaptureInput[] = [];
  for (const c of raw as Record<string, unknown>[]) {
    if (typeof c?.hash !== 'string' || typeof c.ref !== 'string' || typeof c.host !== 'string' || !c.spec || typeof c.spec !== 'object')
      return { ok: false, body: err('bad_request', 'each capture needs hash, ref, host, reps and spec') };
    if (!/^[^/]+\/[^/]+\/[^/#]+$/.test(c.ref)) return { ok: false, body: err('bad_request', `capture ref must be experiment/arm/mode, got ${c.ref}`) };
    const actual = hash(stableStringify(c.spec));
    if (actual !== c.hash) return { ok: false, body: err('spec_hash_mismatch', `spec of ${c.ref} hashes to ${actual}, not ${c.hash}`, { ref: c.ref }) };
    const reps = Number(c.reps);
    if (!Number.isInteger(reps) || reps < 1 || reps > 64) return { ok: false, body: err('bad_request', `reps must be an integer in 1..64 (${c.ref})`) };
    captures.push({ hash: c.hash, ref: c.ref, host: c.host, reps, spec: c.spec as Record<string, unknown> });
  }
  return { ok: true, captures };
}

export function createApp(ctx: AppContext) {
  const { db, bus, runner } = ctx;
  const app = new Hono().basePath('/api');

  app.get('/health', (c) => {
    const p = ctx.probe();
    return c.json({
      status: 'ok',
      startedAt: ctx.startedAt,
      database: { file: ctx.config.dbFile, migrations: (get<{ n: number }>(db, 'select count(*) as n from schema_migrations')?.n ?? 0) },
      probe: p ? (p.ok ? { ok: true, ms: p.ms } : { ok: false, error: p.error }) : { ok: false, error: 'probing' },
      assistant: ctx.assistant?.status() ?? { available: false, reason: 'not configured' },
      // what this server can do; a browser newer than its server must not propose work the server would misread
      features: SERVER_FEATURES,
      sseClients: bus.size,
    });
  });

  // ── hosts ───────────────────────────────────────────────────────────────────────────────
  app.get('/hosts', (c) => {
    const p = ctx.probe();
    return c.json([
      { host: 'local', executor: 'process', synthetic: false, available: Boolean(p?.ok), error: p && !p.ok ? p.error : undefined },
      ...SYNTHETIC_HOSTS.map((host) => ({ host, executor: 'synthetic', synthetic: true, available: true })),
    ]);
  });
  app.get('/hosts/:host/capabilities', (c) => {
    const host = c.req.param('host');
    if (host !== 'local') return c.json(err('not_found', `the server has no probe for ${host}; its report is synthetic and lives in the client`), 404);
    const p = ctx.probe();
    if (!p) return c.json(err('probing', 'the local probe has not finished'), 503);
    if (!p.ok) return c.json(err('probe_failed', p.error), 503);
    return c.json(p.capabilities);
  });

  // ── programs ────────────────────────────────────────────────────────────────────────────
  app.get('/programs/:labId', (c) => {
    const p = getProgram(db, c.req.param('labId'));
    return p ? c.json({ labId: p.lab_id, source: p.source, presetHash: p.preset_hash, updatedAt: p.updated_at }) : c.json(err('not_found', 'no edited program'), 404);
  });
  app.put('/programs/:labId', async (c) => {
    const body = (await c.req.json().catch(() => null)) as { source?: unknown; presetHash?: unknown } | null;
    if (typeof body?.source !== 'string' || body.source.length > 500_000) return c.json(err('bad_request', 'source must be a string up to 500 kB'), 400);
    putProgram(db, c.req.param('labId'), body.source, typeof body.presetHash === 'string' ? body.presetHash : null);
    return c.json({ ok: true });
  });
  app.delete('/programs/:labId', (c) => {
    deleteProgram(db, c.req.param('labId'));
    return c.json({ ok: true });
  });

  // ── catalog and bundles ─────────────────────────────────────────────────────────────────
  app.get('/catalog', (c) => {
    const out: Record<string, unknown> = {};
    for (const a of listArtifacts(db)) {
      if (a.status !== 'available') continue;
      out[a.hash] = { origin: a.origin, source: a.source, ref: `${a.experiment}/${a.arm}/${a.mode}`, host: a.host, reps: a.reps, labId: a.lab_id, importedAt: a.imported_at };
    }
    return c.json(out);
  });
  app.post('/labs/:labId/seed', async (c) => {
    const body = (await c.req.json().catch(() => null)) as { captures?: unknown } | null;
    const v = validateCaptures(body?.captures);
    if (!v.ok) return c.json(v.body, v.body.error === 'spec_hash_mismatch' ? 409 : 400);
    const seeded = seedSynthetic(db, c.req.param('labId'), v.captures, (h) => runner.canExecute(h));
    if (seeded) bus.emit('catalog.changed', { labId: c.req.param('labId') });
    return c.json({ seeded });
  });
  app.get('/bundles', (c) => {
    const hashes = (c.req.query('hashes') ?? '').split(',').filter(Boolean).slice(0, 64);
    const out: Record<string, unknown> = {};
    for (const h of hashes) out[h] = bundlesFor(db, h);
    return c.json(out);
  });

  // ── jobs ────────────────────────────────────────────────────────────────────────────────
  app.get('/jobs', (c) => c.json(listJobs(db, c.req.query('lab') || undefined)));
  app.get('/jobs/:id', (c) => {
    const j = getJob(db, c.req.param('id'));
    return j ? c.json(j) : c.json(err('not_found', 'no such job'), 404);
  });
  app.post('/jobs', async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      id?: unknown;
      labId?: unknown;
      captures?: unknown;
      reason?: unknown;
      proposedBy?: unknown;
      budgetGpuMin?: unknown;
      approve?: unknown;
    } | null;
    if (typeof body?.labId !== 'string') return c.json(err('bad_request', 'labId is required'), 400);
    const v = validateCaptures(body.captures);
    if (!v.ok) return c.json(v.body, v.body.error === 'spec_hash_mismatch' ? 409 : 400);
    const proposedBy = body.proposedBy === 'assistant' ? 'assistant' : 'user';
    if (body.id !== undefined && (typeof body.id !== 'string' || !/^job-[a-z0-9-]{4,48}$/.test(body.id))) return c.json(err('bad_request', 'id must match job-[a-z0-9-]{4,48}'), 400);
    if (typeof body.id === 'string' && getJobRow(db, body.id)) return c.json(err('conflict', `job ${body.id} already exists`), 409);
    const id = createJob(db, {
      id: typeof body.id === 'string' ? body.id : undefined,
      labId: body.labId,
      captures: v.captures,
      reason: typeof body.reason === 'string' ? body.reason.slice(0, 500) : 'no reason given',
      proposedBy,
      budgetGpuMin: Number(body.budgetGpuMin ?? 0) || 0,
    });
    // a person proposing from the pending-plan banner approves in the same request; the assistant never does
    if (body.approve === true && proposedBy === 'user') approve(id);
    bus.emit('job.updated', getJob(db, id));
    return c.json(getJob(db, id), 201);
  });

  const approve = (id: string) => {
    updateJob(db, id, { status: 'approved', approved_at: now() });
    addJobEvent(db, id, 'job.approved', null);
    runner.enqueue(id);
  };

  app.post('/jobs/:id/approve', (c) => {
    const job = getJobRow(db, c.req.param('id'));
    if (!job) return c.json(err('not_found', 'no such job'), 404);
    if (job.status !== 'proposed') return c.json(err('conflict', `job is ${job.status}, not proposed`), 409);
    approve(job.id);
    bus.emit('job.updated', getJob(db, job.id));
    return c.json(getJob(db, job.id));
  });
  app.post('/jobs/:id/cancel', (c) => {
    const job = getJobRow(db, c.req.param('id'));
    if (!job) return c.json(err('not_found', 'no such job'), 404);
    if (['done', 'failed', 'cancelled'].includes(job.status)) return c.json(err('conflict', `job is already ${job.status}`), 409);
    if (job.status === 'proposed' || job.status === 'approved') {
      updateJob(db, job.id, { status: 'cancelled', finished_at: now() });
      addJobEvent(db, job.id, 'job.cancelled', 'cancelled before it ran');
    }
    runner.cancel(job.id);
    bus.emit('job.updated', getJob(db, job.id));
    return c.json(getJob(db, job.id));
  });

  // ── annotations ─────────────────────────────────────────────────────────────────────────
  app.get('/annotations', (c) => c.json(listAnnotations(db, c.req.query('lab') ?? '')));
  app.post('/annotations', async (c) => {
    const b = (await c.req.json().catch(() => null)) as { labId?: unknown; target?: unknown; kind?: unknown; body?: unknown; author?: unknown } | null;
    if (typeof b?.labId !== 'string' || typeof b.target !== 'string' || typeof b.kind !== 'string') return c.json(err('bad_request', 'labId, target and kind are required'), 400);
    const id = addAnnotation(db, { labId: b.labId, target: b.target, kind: b.kind, body: b.body ?? null, author: b.author === 'assistant' ? 'assistant' : 'user' });
    return c.json({ id }, 201);
  });

  // ── evidence archives, datasets and media (ML-PERF-002) ────────────────────────────────
  app.get('/evidence', (c) => c.json(listArchives(db)));
  app.get('/evidence/:sha', (c) => {
    const a = getArchive(db, c.req.param('sha'));
    return a ? c.json(a) : c.json(err('not_found', 'no such archive'), 404);
  });
  app.post('/evidence', async (c) => {
    const declared = Number(c.req.header('content-length') ?? 0);
    if (declared > MAX_ARCHIVE_BYTES) return c.json(err('too_large', `archives are limited to ${MAX_ARCHIVE_BYTES} bytes`), 413);
    const name = (c.req.query('name') ?? '').trim().slice(0, 120) || 'evidence';
    const data = new Uint8Array(await c.req.arrayBuffer());
    try {
      const r = registerArchive(db, ctx.config.dataDir, data, name);
      if (r.created) bus.emit('evidence.registered', { sha256: r.archive.sha256, name: r.archive.name, datasets: r.archive.datasets });
      return c.json(r.archive, r.created ? 201 : 200);
    } catch (e) {
      return c.json(err('bad_archive', (e as Error).message), 400);
    }
  });

  app.get('/datasets', (c) => c.json(listDatasets(db)));
  app.get('/datasets/:id', (c) => {
    const d = getDataset(db, c.req.param('id'));
    return d ? c.json(d) : c.json(err('not_found', 'no such dataset'), 404);
  });
  const materializing = new Set<string>();
  /** Fetches the dataset's missing images from their public source; progress arrives over /events. */
  app.post('/datasets/:id/materialize', (c) => {
    const id = c.req.param('id');
    const d = getDataset(db, id);
    if (!d) return c.json(err('not_found', 'no such dataset'), 404);
    if (materializing.has(id)) return c.json(err('busy', 'this dataset is already being materialized'), 409);
    materializing.add(id);
    void materialize(db, ctx.config.dataDir, id, {
      fetch: ctx.fetcher,
      onProgress: (p) => bus.emit('dataset.progress', { id, ...p }),
    })
      .then((r) => bus.emit('dataset.materialized', r))
      .catch((e: Error) => bus.emit('dataset.materialized', { datasetId: id, total: d.imageCount, present: d.present, fetched: 0, failed: [{ imageId: -1, reason: e.message }] }))
      .finally(() => materializing.delete(id));
    return c.json({ started: true, missing: d.imageCount - d.present }, 202);
  });
  app.get('/media/:sha', (c) => {
    const m = readMedia(db, ctx.config.dataDir, c.req.param('sha'));
    if (!m.ok) return c.json(err(m.status === 403 ? 'forbidden' : m.status === 400 ? 'bad_request' : 'not_found', m.reason), m.status);
    return c.body(new Uint8Array(m.data), 200, {
      'content-type': m.row.mime,
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    });
  });

  // ── live updates ────────────────────────────────────────────────────────────────────────
  app.get('/events', (c) =>
    streamSSE(c, async (stream) => {
      let open = true;
      const off = bus.on((e) => {
        void stream.writeSSE({ event: e.type, data: JSON.stringify(e.data) });
      });
      stream.onAbort(() => {
        open = false;
        off();
      });
      await stream.writeSSE({ event: 'hello', data: JSON.stringify({ at: now() }) });
      while (open) {
        await stream.sleep(15_000);
        if (open) await stream.writeSSE({ event: 'ping', data: '{}' });
      }
    }),
  );

  if (ctx.assistant) ctx.assistant.mount(app);
  return app;
}
