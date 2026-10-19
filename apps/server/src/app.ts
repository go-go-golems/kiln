// The Hono application (guide §30.3): /api routes and the workbench page with the session token. Every request
// passes the security checks first (security.ts); state lives in SQLite; server-sent events only notify.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { streamSSE } from 'hono/streaming';
import { agentRoutes } from './agent.ts';
import { labRoutes } from './lab/routes.ts';
import { VERSION, type ServerConfig } from './config.ts';
import { get, now, type Db } from './db.ts';
import type { Devices } from './devices.ts';
import type { EventBus } from './events.ts';
import type { Jobs, Reply } from './jobs.ts';
import { deleteRecords, insertRecords, listRecords, MAX_RECORDS_PER_POST } from './records.ts';
import { security } from './security.ts';

export interface AppContext {
  config: ServerConfig;
  db: Db;
  bus: EventBus;
  devices: Devices;
  jobs: Jobs;
  token: string;
  startedAt: string;
}

export const FEATURES = ['records', 'devices', 'jobs', 'events', 'lab'];
const PAGE = 'kiln-workbench.html';
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

const err = (error: string, message: string, extra: Record<string, unknown> = {}) => ({ error, message, ...extra });
const reply = (c: Context, r: Reply) => c.json(r.body as object, r.status);
const readJson = (c: Context): Promise<unknown> => c.req.json().catch(() => undefined);

/** The built page with the token in a meta tag; the page reads it to call the API. */
export function pageWithToken(html: string, token: string): string {
  const meta = `<meta name="kiln-token" content="${token}">`;
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (h) => `${h}\n${meta}`) : `${meta}\n${html}`;
}

export function createApp(ctx: AppContext): Hono {
  const { db, bus, devices, jobs, config } = ctx;
  const app = new Hono();
  app.use('*', security({ port: config.port, token: ctx.token }));
  app.use('/api/*', bodyLimit({ maxSize: 32 * 1024 * 1024, onError: (c) => c.json(err('too_large', 'request bodies are limited to 32 MiB'), 413) }));

  const api = new Hono();
  api.use('*', async (c, next) => {
    await next();
    // except content-addressed bytes that a route declares immutable (lab media)
    if (!/\bimmutable\b/.test(c.res.headers.get('cache-control') ?? '')) c.res.headers.set('cache-control', 'no-store');
  });
  api.get('/health', (c) =>
    c.json({
      status: 'ok',
      version: VERSION,
      startedAt: ctx.startedAt,
      db: { migrations: get<{ n: number }>(db, 'select count(*) as n from schema_migrations')?.n ?? 0 },
      executors: devices.executors.size,
      features: FEATURES,
      sseClients: bus.size,
    }),
  );

  // ── records ─────────────────────────────────────────────────────────────────────────────────────────────────
  api.get('/records', (c) => {
    const since = c.req.query('since');
    if (since !== undefined && !ISO.test(since)) return c.json(err('bad_request', 'since must be an ISO 8601 timestamp with a time zone'), 400);
    return c.json({ records: listRecords(db, { device: c.req.query('device'), identity: c.req.query('identity'), since, job: c.req.query('job') }) });
  });
  api.post('/records', async (c) => {
    const body = (await readJson(c)) as { records?: unknown } | undefined;
    if (!Array.isArray(body?.records)) return c.json(err('bad_request', 'the body must be {"records": [...]}'), 400);
    if (body.records.length > MAX_RECORDS_PER_POST) return c.json(err('limit_exceeded', `at most ${MAX_RECORDS_PER_POST} records per request`), 400);
    const { ids, ...res } = insertRecords(db, body.records);
    if (ids.length) bus.emit('records.added', { job: null, ids });
    return c.json(res);
  });
  api.delete('/records', (c) => {
    const device = c.req.query('device');
    if (!device) return c.json(err('bad_request', 'name the device to forget: DELETE /api/records?device=<id>'), 400);
    const deleted = deleteRecords(db, device);
    bus.emit('device.updated', { id: device, deleted });
    return c.json({ deleted });
  });

  // ── devices ─────────────────────────────────────────────────────────────────────────────────────────────────
  api.get('/devices', (c) => c.json({ devices: devices.list() }));
  api.post('/devices/:executor/probe', async (c) => {
    const view = await devices.probe(c.req.param('executor'));
    return view ? c.json(view) : c.json(err('not_found', `no executor ${c.req.param('executor')}`), 404);
  });

  // ── jobs ────────────────────────────────────────────────────────────────────────────────────────────────────
  api.get('/jobs', (c) => c.json({ jobs: jobs.list() }));
  api.get('/jobs/:id', (c) => {
    const v = jobs.view(c.req.param('id'));
    return v ? c.json(v) : c.json(err('not_found', `no job ${c.req.param('id')}`), 404);
  });
  api.post('/jobs', async (c) => {
    const body = await readJson(c);
    if (body === undefined) return c.json(err('bad_json', 'the body is not JSON'), 400);
    return reply(c, jobs.create(body, c.req.header('x-kiln-proposer')));
  });
  api.post('/jobs/:id/approve', (c) => reply(c, jobs.approve(c.req.param('id'))));
  api.post('/jobs/:id/cancel', async (c) => reply(c, await jobs.cancel(c.req.param('id'))));

  // ── events ──────────────────────────────────────────────────────────────────────────────────────────────────
  api.get('/events', (c) =>
    streamSSE(c, async (stream) => {
      const send = (event: string, data: unknown) => stream.writeSSE({ event, data: JSON.stringify(data) }).catch(() => stream.abort());
      await send('hello', { version: VERSION, startedAt: ctx.startedAt, features: FEATURES });
      const off = bus.on((e) => void send(e.type, e.data));
      const ping = setInterval(() => void send('ping', { at: now() }), config.pingMs);
      await new Promise<void>((resolve) => stream.onAbort(resolve));
      off();
      clearInterval(ping);
    }),
  );

  // ── the model gateway (Phase 7): POST /agent/sample, GET /agent/usage ─────────────────────────────────────────
  api.route('/agent', agentRoutes(config, db));

  // ── Perf Lab's data routes (Phase 8c): /api/lab/… with Perf Lab's response shapes ───────────────────────────────
  api.route('/lab', labRoutes({ config, db, bus }));

  api.notFound((c) => c.json(err('not_found', `no route ${c.req.method} ${c.req.path}`), 404));
  app.route('/api', api);

  // ── the page ────────────────────────────────────────────────────────────────────────────────────────────────
  const page = (c: Context) => {
    const file = join(config.dist, PAGE);
    if (!existsSync(file)) return c.text(`The workbench is not built: ${file} does not exist. Run \`pnpm build\` (or \`pnpm dev\`) first.\n`, 404);
    c.header('cache-control', 'no-store');
    return c.html(pageWithToken(readFileSync(file, 'utf8'), ctx.token));
  };
  app.get('/', page);
  app.get('/index.html', page);
  app.notFound((c) => c.text('not found\n', 404));
  return app;
}
