// The four checks that run before any route (guide §30.2). The server can compile and run code on a GPU host, so a
// request is refused unless it comes from the page the server itself served:
//   1. Host allow-list: a DNS-rebinding page reaches 127.0.0.1 under the attacker's host name   → 403 bad_host
//   2. Origin, when present, is this server's (Origin: null from sandboxed frames is refused)    → 403 bad_origin
//   3. X-Kiln-Token on every request that is not GET or HEAD                                     → 403 bad_token
//   4. application/json on every request that is not GET or HEAD                                → 415 unsupported_media_type
// A cross-site page cannot read the token from the served page, and the custom header and the JSON content type
// both force a CORS preflight, which the server never approves (it sends no CORS headers at all).
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';

export const TOKEN_HEADER = 'x-kiln-token';

/** A fresh 256-bit session token, hex. */
export const newToken = (): string => randomBytes(32).toString('hex');

export const allowedHosts = (port: number): string[] => [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`];

const refuse = (code: string, message: string) => ({ error: code, message });

function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function security({ port, token }: { port: number; token: string }): MiddlewareHandler {
  const hosts = new Set(allowedHosts(port));
  const origins = new Set([...hosts].map((h) => `http://${h}`));
  return async (c, next) => {
    const host = (c.req.header('host') ?? '').toLowerCase();
    if (!hosts.has(host)) return c.json(refuse('bad_host', `Host must be one of ${[...hosts].join(', ')}`), 403);
    const origin = c.req.header('origin');
    if (origin !== undefined && !origins.has(origin.toLowerCase())) return c.json(refuse('bad_origin', `Origin ${origin} is not this server`), 403);
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      const given = c.req.header(TOKEN_HEADER);
      if (!given || !sameToken(given, token)) return c.json(refuse('bad_token', `${TOKEN_HEADER} is missing or wrong: requests other than GET need the session token of the served page`), 403);
      const type = (c.req.header('content-type') ?? '').split(';')[0]?.trim().toLowerCase();
      if (type !== 'application/json') return c.json(refuse('unsupported_media_type', 'requests other than GET must be application/json'), 415);
    }
    await next();
    // the page carries the token: no framing (an approval cannot be clickjacked), no referrer, no sniffing
    const h = c.res.headers;
    h.set('x-frame-options', 'DENY');
    h.set('content-security-policy', "frame-ancestors 'none'");
    h.set('referrer-policy', 'no-referrer');
    h.set('x-content-type-options', 'nosniff');
  };
}
