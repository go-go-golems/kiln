// The model gateway (guide §30.3, §31) against a fake Anthropic upstream: a local node:http server that answers in
// the Messages API's server-sent-event wire format. No test reaches the real API: every server built here points
// modelUrl at the fake, and the harness gives loadConfig an empty environment.
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createServer, request as httpRequest, type IncomingHttpHeaders, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { serve } from '@hono/node-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ServerConfig } from '../src/config.ts';
import { all, run } from '../src/db.ts';
import { HOST, makeServer } from './support/server.ts';

const KEY = `sk-ant-test-${randomBytes(16).toString('hex')}`;
const MODEL = 'claude-test-1';

// ── the fake upstream ───────────────────────────────────────────────────────────────────────────────────────────────
type Handler = (body: any, res: ServerResponse) => void | Promise<void>;
const seen: { headers: IncomingHttpHeaders; body: any }[] = [];
let handler: Handler = (_b, res) => void res.writeHead(500).end();
let upstream: Server, upstreamUrl: string;

beforeAll(async () => {
  upstream = createServer((req: IncomingMessage, res) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (d: string) => (raw += d));
    req.on('end', () => {
      const body = JSON.parse(raw);
      seen.push({ headers: req.headers, body });
      void handler(body, res);
    });
  });
  await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', r));
  upstreamUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}/v1/messages`;
});
afterAll(async () => {
  upstream.closeAllConnections();
  await new Promise<void>((r) => upstream.close(() => r()));
});
beforeEach(() => {
  seen.length = 0;
});

const frame = (type: string, data: object = {}) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
const start = (input: number, cacheRead = 0) =>
  frame('message_start', { message: { id: 'msg_1', type: 'message', role: 'assistant', content: [], model: MODEL, stop_reason: null, stop_sequence: null, usage: { input_tokens: input, cache_creation_input_tokens: 0, cache_read_input_tokens: cacheRead, output_tokens: 1 } } });
const block = (index: number, content_block: object, deltas: object[]) =>
  frame('content_block_start', { index, content_block }) + deltas.map((delta) => frame('content_block_delta', { index, delta })).join('') + frame('content_block_stop', { index });
const text = (index: number, ...pieces: string[]) => block(index, { type: 'text', text: '' }, pieces.map((t) => ({ type: 'text_delta', text: t })));
const tool = (index: number, id: string, name: string, ...json: string[]) => block(index, { type: 'tool_use', id, name, input: {} }, json.map((p) => ({ type: 'input_json_delta', partial_json: p })));
const end = (stop: string, output: number) => frame('message_delta', { delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: output } }) + frame('message_stop');

/** Answer with these bytes as an event stream, in 7-byte writes a tick apart, so frames straddle chunks. */
const answer = (sse: string): Handler => async (_b, res) => {
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  for (let i = 0; i < sse.length; i += 7) {
    res.write(sse.slice(i, i + 7));
    await new Promise((r) => setImmediate(r));
  }
  res.end();
};
/** Answer with an HTTP error in the API's JSON error shape. */
const failWith = (status: number, type: string, message: string): Handler => (_b, res) =>
  void res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify({ type: 'error', error: { type, message } }));

// ── the gateway ─────────────────────────────────────────────────────────────────────────────────────────────────────
const gateway = (config: Partial<ServerConfig> = {}) =>
  makeServer({ config: { model: MODEL, apiKey: KEY, modelUrl: upstreamUrl, ...config } });
type Gateway = ReturnType<typeof gateway>;
const ask = (o: object = {}) => ({ conversation: 'c1', messages: [{ role: 'user', content: 'hello' }], ...o });
const rows = (s: Gateway) => all<any>(s.db, 'select * from llm_calls order by id');
const ndjson = (t: string) => t.trim().split('\n').map((l) => JSON.parse(l));

async function sample(s: Gateway, body: unknown, headers: Record<string, string> = {}) {
  const res = await s.call('POST', '/api/agent/sample', { body, headers });
  const raw = await res.text();
  return { status: res.status, type: res.headers.get('content-type'), raw, events: res.status === 200 ? ndjson(raw) : [], json: res.status === 200 ? null : JSON.parse(raw) };
}
async function until(ok: () => boolean, ms = 3000) {
  for (const t0 = Date.now(); !ok(); await new Promise((r) => setTimeout(r, 10))) if (Date.now() - t0 > ms) throw new Error('timed out');
}

describe('POST /api/agent/sample', () => {
  it('streams a text answer as NDJSON and records one row', async () => {
    const s = gateway();
    handler = answer(start(25) + frame('ping') + text(0, 'Hel', 'lo', ' world') + end('end_turn', 7));
    const r = await sample(s, ask({ system: 'be brief', max_tokens: 1000 }));
    expect(r.status).toBe(200);
    expect(r.type).toMatch(/^application\/x-ndjson/);
    expect(r.events).toEqual([
      { type: 'text', text: 'Hel' },
      { type: 'text', text: 'lo' },
      { type: 'text', text: ' world' },
      { type: 'done', message: { role: 'assistant', content: [{ type: 'text', text: 'Hello world' }] }, stop_reason: 'end_turn', usage: { input_tokens: 25, output_tokens: 7, cache_read_tokens: 0 }, call: 1 },
    ]);
    const [row, ...more] = rows(s);
    expect(more).toEqual([]);
    expect(row).toMatchObject({ id: 1, conversation: 'c1', model: MODEL, input_tokens: 25, output_tokens: 7, reasoning_tokens: null, cache_read_tokens: 0, est_prompt_tokens: Math.ceil(('be brief'.length + 'hello'.length) / 4), stop_reason: 'end_turn', error: null });
    expect(row.duration_ms).toBeGreaterThanOrEqual(0);
    expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    // the upstream request: the key in its header, streaming, and one cache breakpoint on the last user block
    expect(seen).toHaveLength(1);
    expect(seen[0]!.headers).toMatchObject({ 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' });
    expect(seen[0]!.body).toEqual({ model: MODEL, max_tokens: 1000, stream: true, system: 'be brief', messages: [{ role: 'user', content: [{ type: 'text', text: 'hello', cache_control: { type: 'ephemeral' } }] }] });
  });

  it('assembles a tool call whose input arrives in several pieces, and keeps thinking blocks for the next round', async () => {
    const s = gateway();
    const tools = [{ name: 'eval', description: 'Run code', input_schema: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] } }];
    const thinking = block(0, { type: 'thinking', thinking: '' }, [{ type: 'signature_delta', signature: 'sig-1' }]);
    handler = answer(start(100, 40) + thinking + text(1, 'Let me look.') + tool(2, 'toolu_2', 'eval', '{"co', 'de": "return', ' 1 + 1"', '}') + end('tool_use', 30));
    const messages = [
      { role: 'user', content: 'q' },
      { role: 'assistant', content: [{ type: 'text', text: 'earlier' }, { type: 'tool_use', id: 'toolu_1', name: 'eval', input: { code: 'x' } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'ok 2' }] },
    ];
    const r = await sample(s, ask({ messages, tools }));
    expect(r.events.filter((e) => e.type === 'text').map((e) => e.text).join('')).toBe('Let me look.');
    expect(r.events.at(-1)).toEqual({
      type: 'done',
      message: { role: 'assistant', content: [{ type: 'thinking', thinking: '', signature: 'sig-1' }, { type: 'text', text: 'Let me look.' }, { type: 'tool_use', id: 'toolu_2', name: 'eval', input: { code: 'return 1 + 1' } }] },
      stop_reason: 'tool_use',
      usage: { input_tokens: 100, output_tokens: 30, cache_read_tokens: 40 },
      call: 1,
    });
    expect(seen[0]!.body.tools).toEqual(tools);
    expect(seen[0]!.body.messages.slice(0, 2)).toEqual(messages.slice(0, 2));
    expect(seen[0]!.body.messages[2]).toEqual({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'ok 2', cache_control: { type: 'ephemeral' } }] });
    const chars = 'q'.length + 'earlier'.length + JSON.stringify({ code: 'x' }).length + 'ok 2'.length + JSON.stringify(tools).length;
    expect(rows(s)).toMatchObject([{ input_tokens: 100, output_tokens: 30, cache_read_tokens: 40, est_prompt_tokens: Math.ceil(chars / 4), stop_reason: 'tool_use', error: null }]);
  });

  it("maps upstream failures and refusals to the page's error words, with one row each", async () => {
    const s = gateway();
    const cases: [Handler, string, string | null][] = [
      [failWith(429, 'rate_limit_error', 'Number of request tokens has exceeded your per-minute rate limit'), 'rate_limited', null],
      [failWith(529, 'overloaded_error', 'Overloaded'), 'rate_limited', null],
      [failWith(413, 'request_too_large', 'Request exceeds the maximum allowed number of bytes.'), 'prompt_too_large', null],
      [failWith(400, 'invalid_request_error', 'prompt is too long: 210000 tokens > 200000 maximum'), 'prompt_too_large', null],
      [failWith(400, 'invalid_request_error', 'messages.1.content: Field required'), 'upstream_error', null],
      [failWith(500, 'api_error', 'Internal server error'), 'upstream_error', null],
      [answer(start(10) + text(0, 'Half') + frame('error', { error: { type: 'overloaded_error', message: 'Overloaded' } })), 'rate_limited', null],
      [answer(start(10) + end('refusal', 2)), 'refused', 'refusal'],
      [answer(start(10) + text(0, 'cut off')), 'upstream_error', null],
    ];
    for (const [i, [h, code, stop]] of cases.entries()) {
      handler = h;
      const r = await sample(s, ask());
      expect([i, r.status, r.events.at(-1)]).toEqual([i, 200, { type: 'error', code, message: expect.any(String), call: i + 1 }]);
      expect([i, rows(s).at(-1)]).toMatchObject([i, { id: i + 1, error: code, stop_reason: stop, model: MODEL, conversation: 'c1' }]);
    }
    expect(rows(s).find((x) => x.error === 'rate_limited')).toMatchObject({ input_tokens: null, output_tokens: null });
    expect(seen).toHaveLength(cases.length);
  });

  it('says why an unreachable upstream failed', async () => {
    const s = gateway({ modelUrl: 'http://127.0.0.1:1/v1/messages' });
    const r = await sample(s, ask());
    expect(r.events).toEqual([{ type: 'error', code: 'upstream_error', message: expect.stringMatching(/^the model could not be reached/), call: 1 }]);
    expect(rows(s)).toMatchObject([{ error: 'upstream_error', input_tokens: null }]);
  });

  for (const how of ['the request is aborted', 'the response is cancelled'] as const) {
    it(`aborts the upstream call and records cancelled when ${how}`, async () => {
      const s = gateway();
      let closed!: Promise<void>;
      handler = (_b, res) => {
        closed = new Promise((r) => res.on('close', () => r()));
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write(start(50) + frame('content_block_start', { index: 0, content_block: { type: 'text', text: '' } }) + frame('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'partial' } }));
      };
      const ac = new AbortController();
      const res = await s.app.request(`http://${HOST}/api/agent/sample`, {
        method: 'POST',
        headers: { host: HOST, 'content-type': 'application/json', 'x-kiln-token': s.token },
        body: JSON.stringify(ask()),
        signal: ac.signal,
      });
      const reader = res.body!.getReader();
      expect(ndjson(new TextDecoder().decode((await reader.read()).value))).toEqual([{ type: 'text', text: 'partial' }]);
      if (how === 'the request is aborted') ac.abort();
      else await reader.cancel();
      await closed;
      await until(() => rows(s).length === 1);
      expect(rows(s)).toMatchObject([{ error: 'cancelled', stop_reason: null, input_tokens: 50, output_tokens: 1, conversation: 'c1' }]);
      reader.cancel().catch(() => {});
    });
  }

  it('aborts the upstream call when the browser goes away from the real HTTP server', async () => {
    const s = gateway();
    const server = serve({ fetch: s.app.fetch, hostname: '127.0.0.1', port: 0 });
    await new Promise<void>((r) => (server.listening ? r() : server.once('listening', () => r())));
    let closed!: Promise<void>;
    handler = (_b, res) => {
      closed = new Promise((r) => res.on('close', () => r()));
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(start(60) + text(0, 'still going'));
    };
    const body = JSON.stringify(ask());
    const req = httpRequest({ host: '127.0.0.1', port: (server.address() as AddressInfo).port, method: 'POST', path: '/api/agent/sample', headers: { host: HOST, 'content-type': 'application/json', 'x-kiln-token': s.token, 'content-length': Buffer.byteLength(body) } });
    const first = await new Promise<string>((resolve, reject) => {
      req.on('response', (res) => res.once('data', (d: Buffer) => resolve(d.toString('utf8'))));
      req.on('error', reject);
      req.end(body);
    });
    expect(first).toContain('"type":"text"');
    req.destroy();
    await closed;
    await until(() => rows(s).length === 1);
    expect(rows(s)).toMatchObject([{ error: 'cancelled', input_tokens: 60 }]);
    await new Promise<void>((r) => server.close(() => r()));
  });

  it('is off without a model or a key (503), and checks the body before calling anyone (400, 413)', async () => {
    expect((await sample(gateway({ model: null }), ask())).json).toEqual({ error: 'no_model', message: expect.stringContaining('KILN_MODEL') });
    expect((await sample(gateway({ apiKey: null }), ask())).json).toEqual({ error: 'no_api_key', message: expect.stringContaining('ANTHROPIC_API_KEY') });
    expect((await sample(gateway({ model: null }), ask())).status).toBe(503);
    const s = gateway();
    const bad: unknown[] = [
      [],
      { conversation: 'c' },
      ask({ messages: [] }),
      ask({ messages: Array.from({ length: 401 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'x' })) }),
      ask({ messages: [{ role: 'system', content: 'x' }] }),
      ask({ messages: [{ role: 'assistant', content: 'x' }] }),
      ask({ messages: [{ role: 'user', content: 5 }] }),
      ask({ messages: [{ role: 'user', content: [] }] }),
      ask({ messages: [{ role: 'user', content: [{ text: 'no type' }] }] }),
      ask({ tools: [{ name: 'has space', description: 'd', input_schema: {} }] }),
      ask({ tools: [{ name: 'eval', input_schema: {} }] }),
      ask({ max_tokens: 0 }),
      ask({ max_tokens: 32_001 }),
      ask({ max_tokens: 1.5 }),
      ask({ conversation: '' }),
      ask({ conversation: 'x'.repeat(201) }),
      ask({ system: 5 }),
    ];
    for (const body of bad) {
      const r = await sample(s, body);
      expect([body, r.status, r.json?.error]).toEqual([body, 400, 'bad_request']);
    }
    const notJson = await s.app.request(`http://${HOST}/api/agent/sample`, { method: 'POST', headers: { host: HOST, 'content-type': 'application/json', 'x-kiln-token': s.token }, body: '{nope' });
    expect([notJson.status, ((await notJson.json()) as any).error]).toEqual([400, 'bad_json']);
    const big = await sample(s, ask({ messages: [{ role: 'user', content: 'x'.repeat(4.5 * 1024 * 1024) }] }));
    expect([big.status, big.json.error]).toEqual([413, 'prompt_too_large']);
    expect(seen).toEqual([]);
    expect(rows(s)).toEqual([]);
  });

  it('cannot be reached by the sandboxed agent frame: Origin null and a missing token are refused', async () => {
    const s = gateway();
    handler = answer(start(1) + text(0, 'x') + end('end_turn', 1));
    expect((await s.json('POST', '/api/agent/sample', { body: ask(), headers: { origin: 'null' } })).body.error).toBe('bad_origin');
    expect((await s.json('POST', '/api/agent/sample', { body: ask(), token: null })).body.error).toBe('bad_token');
    expect((await s.json('POST', '/api/agent/sample', { body: ask(), token: null, headers: { origin: 'null' } })).status).toBe(403);
    expect((await s.json('GET', '/api/agent/usage', { headers: { origin: 'null' } })).body.error).toBe('bad_origin');
    expect((await s.json('POST', '/api/agent/sample', { body: ask(), headers: { 'content-type': 'text/plain' } })).status).toBe(415);
    expect(seen).toEqual([]);
    expect(rows(s)).toEqual([]);
    // the page itself (its own origin and token) gets through
    expect((await sample(s, ask(), { origin: `http://${HOST}` })).events.at(-1).type).toBe('done');
  });
});

describe('GET /api/agent/usage', () => {
  it('sums tokens by model and lists the most recent conversations first', async () => {
    const s = gateway();
    expect((await s.json('GET', '/api/agent/usage')).body).toEqual({ model: MODEL, ready: true, totals: [], conversations: [] });
    for (const [conversation, input, output] of [['a', 10, 1], ['a', 20, 2], ['b', 40, 4], [null, 80, 8]] as const) {
      handler = answer(start(input, 5) + text(0, 'ok') + end('end_turn', output));
      await sample(s, ask({ conversation }));
    }
    handler = failWith(429, 'rate_limit_error', 'slow down');
    await sample(s, ask({ conversation: 'b' }));
    run(s.db, 'insert into llm_calls (conversation, model, input_tokens, output_tokens, est_prompt_tokens, created_at) values (?, ?, ?, ?, ?, ?)', 'z', 'other-model', 1000, 100, 900, '2099-01-01T00:00:00.000Z');
    const est = Math.ceil('hello'.length / 4);
    const u = (await s.json('GET', '/api/agent/usage')).body;
    expect(u.totals).toEqual([
      { model: MODEL, calls: 5, input_tokens: 150, output_tokens: 15, cache_read_tokens: 20, est_prompt_tokens: 5 * est },
      { model: 'other-model', calls: 1, input_tokens: 1000, output_tokens: 100, cache_read_tokens: 0, est_prompt_tokens: 900 },
    ]);
    expect(u.conversations.map((c: any) => [c.conversation, c.model, c.calls, c.input_tokens, c.output_tokens])).toEqual([
      ['z', 'other-model', 1, 1000, 100],
      ['b', MODEL, 2, 40, 4],
      ['a', MODEL, 2, 30, 3],
    ]);
    expect(u.conversations[1].last_at >= u.conversations[2].last_at).toBe(true);
    for (let i = 0; i < 60; i++) run(s.db, 'insert into llm_calls (conversation, model, created_at) values (?, ?, ?)', `many-${i}`, MODEL, '2098-01-01T00:00:00.000Z');
    expect((await s.json('GET', '/api/agent/usage')).body.conversations).toHaveLength(50);
    expect((await s.json('GET', '/api/agent/usage')).body).toMatchObject({ model: MODEL, ready: true });
    expect((await gateway({ apiKey: null }).json('GET', '/api/agent/usage')).body).toMatchObject({ model: MODEL, ready: false });
  });
});

describe('the API key', () => {
  it('goes upstream and nowhere else: not in a response, an error message or a row', async () => {
    const s = gateway();
    const bodies: string[] = [];
    const scenarios: Handler[] = [
      answer(start(3) + text(0, 'fine') + end('end_turn', 1)),
      answer(start(3) + tool(0, 'toolu_9', 'eval', '{"code":"1"}') + end('tool_use', 1)),
      failWith(401, 'authentication_error', `invalid x-api-key ${KEY}`),
      answer(start(3) + frame('error', { error: { type: 'api_error', message: `upstream echoed ${KEY} back` } })),
    ];
    for (const h of scenarios) {
      handler = h;
      bodies.push((await sample(s, ask())).raw);
    }
    bodies.push(JSON.stringify((await s.json('GET', '/api/agent/usage')).body), JSON.stringify((await s.json('GET', '/api/health')).body));
    for (const b of bodies) expect(b).not.toContain(KEY);
    expect(JSON.stringify(rows(s))).not.toContain(KEY);
    expect(bodies[2]).toContain('[redacted]');
    expect(seen.map((x) => x.headers['x-api-key'])).toEqual([KEY, KEY, KEY, KEY]);
  });
});

describe('the page and the server together', () => {
  // the page's own gatewaySample (plain JS, no declarations: imported through a computed specifier) over the real route
  const GATEWAY_JS = fileURLToPath(new URL('../../workbench/src/agent/gateway.js', import.meta.url));
  type Sample = (turns: { role: string; content: string }[], o: object) => Promise<{ text: string; truncated: boolean; modelTierApplied: string }>;
  const load = async () => (await import(GATEWAY_JS)) as { gatewaySample: (o: object) => Sample };
  const viaApp = (s: Gateway) => (url: string, init: RequestInit) => s.app.request(url, { ...init, headers: { ...(init.headers as Record<string, string>), host: HOST } });

  it("runs the page's tool loop through POST /api/agent/sample: two calls, two rows, the tool result in the second", async () => {
    const { gatewaySample } = await load();
    const s = gateway();
    const answers = [start(30) + text(0, 'Checking.') + tool(1, 'toolu_a', 'eval', '{"code":', ' "return 6 * 7"}') + end('tool_use', 12), start(45, 30) + text(0, 'It is 42.') + end('end_turn', 6)];
    let n = 0;
    handler = (b, res) => answer(answers[n++]!)(b, res);
    const shown: string[] = [];
    const evalTool = { name: 'eval', description: 'Run code', inputSchema: { type: 'object', properties: { code: { type: 'string' } } }, execute: async (input: { code: string }) => `ok\n${input.code === 'return 6 * 7' ? 42 : '?'}` };
    const sample = gatewaySample({ base: `http://${HOST}`, token: s.token, conversation: () => 'conv-e2e', fetch: viaApp(s) });
    const r = await sample([{ role: 'user', content: 'what is 6 * 7?' }], { modelTier: 'default', onText: ({ text: t }: { text: string }) => shown.push(t), tools: [evalTool] });
    expect(r).toEqual({ text: 'Checking.\n\nIt is 42.', truncated: false, modelTierApplied: 'default' });
    expect(shown.at(-1)).toBe(r.text);
    expect(seen.map((x) => x.body.messages)).toEqual([
      [{ role: 'user', content: [{ type: 'text', text: 'what is 6 * 7?', cache_control: { type: 'ephemeral' } }] }],
      [
        { role: 'user', content: 'what is 6 * 7?' },
        { role: 'assistant', content: [{ type: 'text', text: 'Checking.' }, { type: 'tool_use', id: 'toolu_a', name: 'eval', input: { code: 'return 6 * 7' } }] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_a', content: 'ok\n42', cache_control: { type: 'ephemeral' } }] },
      ],
    ]);
    expect(rows(s)).toMatchObject([
      { conversation: 'conv-e2e', input_tokens: 30, output_tokens: 12, cache_read_tokens: 0, stop_reason: 'tool_use', error: null },
      { conversation: 'conv-e2e', input_tokens: 45, output_tokens: 6, cache_read_tokens: 30, stop_reason: 'end_turn', error: null },
    ]);
  });

  it("surfaces the server's refusals and the upstream's errors as the page's error codes", async () => {
    const { gatewaySample } = await load();
    const s = gateway();
    const turns = [{ role: 'user', content: 'hi' }];
    await expect(gatewaySample({ base: `http://${HOST}`, token: undefined, fetch: viaApp(s) })(turns, {})).rejects.toMatchObject({ code: 'bad_token' });
    const off = gateway({ model: null });
    await expect(gatewaySample({ base: `http://${HOST}`, token: off.token, fetch: viaApp(off) })(turns, {})).rejects.toMatchObject({ code: 'no_model' });
    handler = failWith(429, 'rate_limit_error', 'slow down');
    await expect(gatewaySample({ base: `http://${HOST}`, token: s.token, fetch: viaApp(s) })(turns, {})).rejects.toMatchObject({ code: 'rate_limited', text: '' });
    expect(rows(s)).toMatchObject([{ error: 'rate_limited' }]);
  });
});
