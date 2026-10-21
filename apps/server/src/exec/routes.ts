// The execution core's routes (guide §28.1): hosts and their capability documents, the one job API, and archives —
// evidence produced outside Kiln and the result archives of jobs, listed together.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Hono, type Context } from 'hono';
import type { Db } from '../db.ts';
import type { EventBus } from '../events.ts';
import { getArchive, listArchives, MAX_ARCHIVE_BYTES, readArchivePath, registerArchive } from '../lab/evidence.ts';
import { archiveCopy, SHA256_HEX } from '../lab/files.ts';
import { workloadsRevision } from './assets.ts';
import type { Hosts } from './hosts.ts';
import type { Jobs, Reply } from './jobs.ts';

const err = (error: string, message: string, extra: Record<string, unknown> = {}) => ({ error, message, ...extra });
const reply = (c: Context, r: Reply) => c.json(r.body as object, r.status);
const readJson = (c: Context): Promise<unknown> => c.req.json().catch(() => undefined);
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

export function execRoutes({ db, bus, hosts, jobs, dataDir, labWorkloads }: { db: Db; bus: EventBus; hosts: Hosts; jobs: Jobs; dataDir: string; labWorkloads: string }): Hono {
  const r = new Hono();

  // ── hosts ───────────────────────────────────────────────────────────────────────────────────────────────────────
  r.get('/hosts', async (c) => {
    // the queue state is cheap to refresh; capability documents are refreshed only by a probe
    await Promise.all(hosts.ids().map((id) => hosts.ping(id)));
    return c.json({ hosts: hosts.list(), workloads: { perf_lab_local: workloadsRevision(labWorkloads) } });
  });
  r.get('/hosts/:id/capabilities', async (c) => {
    const id = c.req.param('id');
    if (!hosts.profile(id)) return c.json(err('not_found', `no host ${id}`), 404);
    try {
      return c.json(await hosts.capabilities(id));
    } catch (e) {
      return c.json(err('host_unreachable', (e as Error).message, { cached: hosts.cached(id) }), 503);
    }
  });
  r.post('/hosts/:id/probe', async (c) => {
    const id = c.req.param('id');
    if (!hosts.profile(id)) return c.json(err('not_found', `no host ${id}`), 404);
    try {
      return c.json(await hosts.capabilities(id, { force: true }));
    } catch (e) {
      return c.json(err('host_unreachable', (e as Error).message), 503);
    }
  });

  // ── jobs ────────────────────────────────────────────────────────────────────────────────────────────────────────
  r.get('/jobs', (c) => c.json({ jobs: jobs.list() }));
  r.get('/jobs/:id', (c) => {
    const v = jobs.view(c.req.param('id'));
    return v ? c.json(v) : c.json(err('not_found', `no job ${c.req.param('id')}`), 404);
  });
  r.get('/jobs/:id/plan', (c) => {
    const p = jobs.plan(c.req.param('id'));
    return p ? c.json(p) : c.json(err('not_found', `no plan for job ${c.req.param('id')}`), 404);
  });
  r.post('/jobs', async (c) => {
    const body = await readJson(c);
    if (body === undefined) return c.json(err('bad_json', 'the body is not JSON'), 400);
    return reply(c, await jobs.create(body, c.req.header('x-kiln-proposer')));
  });
  r.post('/jobs/:id/approve', (c) => reply(c, jobs.approve(c.req.param('id'))));
  r.post('/jobs/:id/cancel', async (c) => reply(c, await jobs.cancel(c.req.param('id'))));
  r.post('/jobs/:id/reimport', (c) => reply(c, jobs.reimport(c.req.param('id'))));

  // ── archives ────────────────────────────────────────────────────────────────────────────────────────────────────
  r.get('/archives', (c) => c.json(listArchives(db)));
  r.get('/archives/:sha', (c) => {
    const sha = c.req.param('sha');
    if (!SHA256_HEX.test(sha) || !getArchive(db, sha)) return c.json(err('not_found', 'no such archive'), 404);
    const file = [join(dataDir, 'archives', `${sha}.tar.gz`), archiveCopy(dataDir, sha)].find((f) => existsSync(f));
    if (!file) return c.json(err('not_found', 'the archive is registered but its bytes are gone'), 404);
    return c.body(new Uint8Array(readFileSync(file)), 200, { 'content-type': 'application/gzip', 'content-disposition': `attachment; filename="${sha}.tar.gz"` });
  });
  /** Evidence produced outside Kiln: {name?, data: base64 of the .tar.gz} or {name?, path: absolute path}; 201 new, 200 known. */
  r.post('/archives', async (c) => {
    const body = await readJson(c);
    if (!isObj(body)) return c.json(err('bad_request', 'the body must be {"name"?, "data": base64} or {"name"?, "path": "/abs/archive.tar.gz"}'), 400);
    const { data, path } = body;
    if ((data === undefined) === (path === undefined)) return c.json(err('bad_request', 'give exactly one of data (base64 of the archive) and path (an absolute path on this machine)'), 400);
    const name = (typeof body.name === 'string' ? body.name : '').trim().slice(0, 120) || 'evidence';
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
      const res = registerArchive(db, dataDir, bytes, name);
      if (res.created) bus.emit('evidence.registered', { sha256: res.archive.sha256, name: res.archive.name, datasets: res.archive.datasets });
      return c.json(res.archive, res.created ? 201 : 200);
    } catch (e) {
      return c.json(err('bad_archive', (e as Error).message), 400);
    }
  });

  return r;
}
