import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pageWithToken } from '../src/app.ts';
import { HOST, makeServer } from './support/server.ts';

describe('the four checks before any route (guide §30.2)', () => {
  const s = makeServer();

  it('refuses a Host outside the allow-list, on the API and on the page', async () => {
    for (const host of ['evil.example:5280', 'evil.example', '127.0.0.1:5281', '127.0.0.1', 'localhost', '']) {
      for (const path of ['/api/health', '/']) {
        const r = await s.json('GET', path, { headers: { host } });
        expect([host, path, r.status, r.body.error]).toEqual([host, path, 403, 'bad_host']);
      }
    }
  });

  it('accepts the three loopback names with the port', async () => {
    for (const host of ['127.0.0.1:5280', 'localhost:5280', '[::1]:5280', 'LOCALHOST:5280']) {
      expect((await s.call('GET', '/api/health', { headers: { host } })).status).toBe(200);
    }
  });

  it('refuses a foreign Origin and Origin: null, and accepts its own', async () => {
    for (const origin of ['http://evil.example', 'null', 'https://127.0.0.1:5280', 'http://127.0.0.1:5281']) {
      const r = await s.json('GET', '/api/records', { headers: { origin } });
      expect([origin, r.status, r.body.error]).toEqual([origin, 403, 'bad_origin']);
    }
    expect((await s.call('GET', '/api/records', { headers: { origin: `http://${HOST}` } })).status).toBe(200);
    expect((await s.call('POST', '/api/records', { body: { records: [] }, headers: { origin: 'http://localhost:5280' } })).status).toBe(200);
  });

  it('refuses a request other than GET without the session token, or with a wrong one', async () => {
    for (const [method, path] of [['POST', '/api/records'], ['DELETE', '/api/records?device=x'], ['POST', '/api/jobs'], ['POST', '/api/jobs/j/approve'], ['POST', '/api/devices/fake/probe'], ['PUT', '/api/records'], ['OPTIONS', '/api/records']] as const) {
      for (const token of [null, '0'.repeat(64), `${s.token}0`, s.token.slice(1)]) {
        const r = await s.json(method, path, { token, body: { records: [] } });
        expect([method, path, r.status, r.body.error]).toEqual([method, path, 403, 'bad_token']);
      }
    }
  });

  it('refuses a request other than GET that is not application/json', async () => {
    for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', '']) {
      const r = await s.json('POST', '/api/records', { headers: { 'content-type': type }, body: { records: [] } });
      expect([type, r.status, r.body.error]).toEqual([type, 415, 'unsupported_media_type']);
    }
    expect((await s.call('POST', '/api/records', { headers: { 'content-type': 'application/json; charset=utf-8' }, body: { records: [] } })).status).toBe(200);
  });

  it('checks in order: host, origin, token, content type', async () => {
    expect((await s.json('POST', '/api/records', { headers: { host: 'evil.example', origin: 'null', 'content-type': 'text/plain' }, token: null })).body.error).toBe('bad_host');
    expect((await s.json('POST', '/api/records', { headers: { origin: 'null', 'content-type': 'text/plain' }, token: null })).body.error).toBe('bad_origin');
    expect((await s.json('POST', '/api/records', { headers: { 'content-type': 'text/plain' }, token: null })).body.error).toBe('bad_token');
  });

  it('sends no CORS headers and forbids framing', async () => {
    const r = await s.call('GET', '/api/health', { headers: { origin: `http://${HOST}` } });
    expect(r.headers.get('access-control-allow-origin')).toBeNull();
    expect(r.headers.get('x-frame-options')).toBe('DENY');
    expect(r.headers.get('content-security-policy')).toBe("frame-ancestors 'none'");
  });

  it('reports health', async () => {
    const r = await s.json('GET', '/api/health');
    expect(r.body).toMatchObject({ status: 'ok', version: 'kiln-server/0.1', db: { migrations: 3 }, hosts: 0, features: ['records', 'devices', 'hosts', 'jobs', 'archives', 'events', 'lab'] });
  });
});

describe('the page', () => {
  it('is served with the session token in a meta tag, never cached', async () => {
    const s = makeServer();
    mkdirSync(s.config.dist, { recursive: true });
    writeFileSync(join(s.config.dist, 'kiln-workbench.html'), '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">\n</head><body><div id="root"></div></body></html>\n');
    const r = await s.call('GET', '/');
    const html = await r.text();
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(html).toContain(`<head>\n<meta name="kiln-token" content="${s.token}">`);
    expect(s.token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is a clear 404 when the workbench is not built', async () => {
    const s = makeServer();
    const r = await s.call('GET', '/');
    expect(r.status).toBe(404);
    expect(await r.text()).toMatch(/The workbench is not built: .*kiln-workbench\.html does not exist\. Run `pnpm build`/);
  });

  it('injects the token into a page without a head', () => {
    expect(pageWithToken('<div></div>', 'ab')).toBe('<meta name="kiln-token" content="ab">\n<div></div>');
  });
});
