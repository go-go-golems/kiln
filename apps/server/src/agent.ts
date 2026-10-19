// The model gateway (guide §30.3, §31). POST /api/agent/sample relays one streamed Anthropic Messages call to the
// page as NDJSON and writes exactly one llm_calls row for it, whatever the outcome; GET /api/agent/usage sums the
// rows. The page runs the tool loop (apps/workbench/src/agent/gateway.js): the server never executes a tool, so a
// model call reaches nothing the page could not already reach. Both routes sit behind the /api security checks, so
// the sandboxed agent frame (Origin: null, no token) is refused before it gets here.
// The API key goes into one upstream request header and nowhere else: not a response, not a log line, not a row.
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { ServerConfig } from './config.ts';
import { all, now, run, type Db } from './db.ts';

export const LIMITS = { bodyBytes: 4 * 1024 * 1024, messages: 400, blocks: 400, tools: 32, maxTokens: 32_000, conversation: 200 };
export const DEFAULT_MAX_TOKENS = 16_000;
const ANTHROPIC_VERSION = '2023-06-01';

type Json = Record<string, unknown>;
export type Block = Json & { type: string };
export interface Message {
  role: 'user' | 'assistant';
  content: string | Block[];
}
export interface Tool {
  name: string;
  description: string;
  input_schema: Json;
}
export interface SampleRequest {
  conversation: string | null;
  messages: Message[];
  tools: Tool[];
  system: string | null;
  maxTokens: number;
}
/** The error words the page already understands (ERRORS in agent.js), plus upstream_error for everything else */
export type ErrorCode = 'rate_limited' | 'prompt_too_large' | 'refused' | 'cancelled' | 'upstream_error';
interface Usage {
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
}
interface Outcome {
  content: Block[];
  stop_reason: string | null;
  usage: Usage;
  error: { code: ErrorCode; message: string } | null;
}

const err = (error: string, message: string) => ({ error, message });
const isObj = (x: unknown): x is Json => typeof x === 'object' && x !== null && !Array.isArray(x);
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const TOOL_NAME = /^[a-zA-Z0-9_-]{1,64}$/;

/** The request body, checked; a string is the reason it was refused (400). Only known fields are passed upstream. */
export function parseSample(body: unknown): SampleRequest | string {
  if (!isObj(body)) return 'the body must be a JSON object';
  const { conversation = null, messages, tools = [], system = null, max_tokens = DEFAULT_MAX_TOKENS } = body;
  if (conversation !== null && (typeof conversation !== 'string' || !conversation || conversation.length > LIMITS.conversation))
    return `conversation must be null or a string of 1 to ${LIMITS.conversation} characters`;
  if (!Array.isArray(messages) || !messages.length || messages.length > LIMITS.messages) return `messages must be an array of 1 to ${LIMITS.messages} messages`;
  const msgs: Message[] = [];
  for (const [i, m] of messages.entries()) {
    if (!isObj(m) || (m.role !== 'user' && m.role !== 'assistant')) return `messages[${i}].role must be "user" or "assistant"`;
    const c = m.content;
    if (typeof c !== 'string' && !(Array.isArray(c) && c.length && c.length <= LIMITS.blocks && c.every((b) => isObj(b) && typeof b.type === 'string')))
      return `messages[${i}].content must be a string or an array of 1 to ${LIMITS.blocks} content blocks`;
    msgs.push({ role: m.role, content: c as string | Block[] });
  }
  if (msgs[0]?.role !== 'user') return 'the first message must be from the user';
  if (!Array.isArray(tools) || tools.length > LIMITS.tools) return `tools must be an array of at most ${LIMITS.tools} tools`;
  const tls: Tool[] = [];
  for (const [i, t] of tools.entries()) {
    if (!isObj(t) || typeof t.name !== 'string' || !TOOL_NAME.test(t.name) || typeof t.description !== 'string' || !isObj(t.input_schema))
      return `tools[${i}] must be {name, description, input_schema} with a name of letters, digits, _ or -`;
    tls.push({ name: t.name, description: t.description, input_schema: t.input_schema });
  }
  if (system !== null && typeof system !== 'string') return 'system must be a string';
  if (!Number.isInteger(max_tokens) || (max_tokens as number) < 1 || (max_tokens as number) > LIMITS.maxTokens) return `max_tokens must be an integer from 1 to ${LIMITS.maxTokens}`;
  return { conversation, messages: msgs, tools: tls, system: system || null, maxTokens: max_tokens as number };
}

/** ceil(characters / 4) over what the page sends: system, message text, tool inputs and results, tool definitions. */
export function estimatePromptTokens(r: SampleRequest): number {
  const text = (x: unknown) => (typeof x === 'string' ? x.length : 0);
  const block = (b: Block): number =>
    b.type === 'text' ? text(b.text)
    : b.type === 'tool_use' ? JSON.stringify(b.input ?? {}).length
    : b.type === 'tool_result' ? (Array.isArray(b.content) ? b.content.reduce((a: number, x) => a + (isObj(x) ? text(x.text) : 0), 0) : text(b.content))
    : 0;
  let chars = text(r.system) + (r.tools.length ? JSON.stringify(r.tools).length : 0);
  for (const m of r.messages) chars += typeof m.content === 'string' ? m.content.length : m.content.reduce((a, b) => a + block(b), 0);
  return Math.ceil(chars / 4);
}

// One cache breakpoint on the last user block: within an answer every tool round resends the whole conversation, so
// round n+1 reads what round n wrote (cache_read_tokens). A prefix below the model's minimum silently does not cache.
function withBreakpoint(messages: Message[]): Message[] {
  const last = messages[messages.length - 1];
  const has = messages.some((m) => typeof m.content !== 'string' && m.content.some((b) => 'cache_control' in b));
  if (!last || last.role !== 'user' || has) return messages;
  const mark = { type: 'ephemeral' };
  let content: Block[];
  if (typeof last.content === 'string') {
    if (!last.content) return messages;
    content = [{ type: 'text', text: last.content, cache_control: mark }];
  } else {
    const end = last.content[last.content.length - 1];
    if (!end || (end.type !== 'text' && end.type !== 'tool_result')) return messages;
    content = [...last.content.slice(0, -1), { ...end, cache_control: mark }];
  }
  return [...messages.slice(0, -1), { role: 'user', content }];
}

/** The page's error word for an upstream failure: HTTP status (0 inside a stream), the API's error type, its message. */
export function errorCode(status: number, type: string, message: string): ErrorCode {
  if (status === 429 || status === 529 || type === 'rate_limit_error' || type === 'overloaded_error') return 'rate_limited';
  if (status === 413 || type === 'request_too_large') return 'prompt_too_large';
  if ((status === 400 || type === 'invalid_request_error') && /prompt is too long|too many tokens|context (length|window)/i.test(message)) return 'prompt_too_large';
  return 'upstream_error';
}

/** Server-sent events from a fetch body: the parsed data of each frame (every Anthropic frame carries its type). */
async function* sse(body: ReadableStream<Uint8Array>): AsyncGenerator<Json> {
  const reader = body.getReader(), dec = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      buf += dec.decode(value, { stream: true });
      for (let m = /\r?\n\r?\n/.exec(buf); m; m = /\r?\n\r?\n/.exec(buf)) {
        const data = buf.slice(0, m.index).split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).replace(/^ /, '')).join('\n');
        buf = buf.slice(m.index + m[0].length);
        if (data) yield JSON.parse(data) as Json;
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

/** One streamed Messages call: text deltas go to onText as they arrive; never throws. */
async function callModel(config: ServerConfig, r: SampleRequest, signal: AbortSignal, onText: (text: string) => void): Promise<Outcome> {
  const usage: Usage = { input_tokens: null, output_tokens: null, cache_read_tokens: null };
  const blocks: Block[] = [];
  const partial = new Map<number, string>();
  let stop: string | null = null, badInput = false, finished = false;
  const scrub = (s: string) => (config.apiKey ? s.split(config.apiKey).join('[redacted]') : s).slice(0, 1000);
  const fail = (code: ErrorCode, message: string): Outcome => ({ content: [], stop_reason: stop, usage, error: signal.aborted ? { code: 'cancelled', message: 'the page stopped the request' } : { code, message: scrub(message) } });
  const take = (u: unknown) => {
    if (!isObj(u)) return;
    usage.input_tokens = num(u.input_tokens) ?? usage.input_tokens;
    usage.output_tokens = num(u.output_tokens) ?? usage.output_tokens;
    usage.cache_read_tokens = num(u.cache_read_input_tokens) ?? usage.cache_read_tokens;
  };
  let res: Response;
  try {
    res = await fetch(config.modelUrl, {
      method: 'POST',
      headers: { 'x-api-key': config.apiKey ?? '', 'anthropic-version': ANTHROPIC_VERSION, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        max_tokens: r.maxTokens,
        stream: true,
        ...(r.system ? { system: r.system } : {}),
        ...(r.tools.length ? { tools: r.tools } : {}),
        messages: withBreakpoint(r.messages),
      }),
      signal,
    });
  } catch (e) {
    return fail('upstream_error', `the model could not be reached: ${why(e)}`);
  }
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => '');
    let type = '', message = body;
    try {
      const e = (JSON.parse(body) as { error?: { type?: unknown; message?: unknown } }).error;
      type = typeof e?.type === 'string' ? e.type : '';
      message = typeof e?.message === 'string' ? e.message : body;
    } catch {
      /* not JSON: keep the text */
    }
    return fail(errorCode(res.status, type, message), `the model API answered HTTP ${res.status}${type ? ` ${type}` : ''}: ${message}`);
  }
  try {
    for await (const ev of sse(res.body)) {
      const i = num(ev.index) ?? -1, b = blocks[i];
      switch (ev.type) {
        case 'message_start':
          take(isObj(ev.message) ? ev.message.usage : null);
          break;
        case 'content_block_start':
          if (isObj(ev.content_block) && typeof ev.content_block.type === 'string') {
            const nb = { ...ev.content_block } as Block;
            blocks[i] = nb;
            if (nb.type === 'tool_use') partial.set(i, '');
            if (nb.type === 'text' && typeof nb.text === 'string' && nb.text) onText(nb.text);
          }
          break;
        case 'content_block_delta': {
          const d = isObj(ev.delta) ? ev.delta : {};
          if (!b) break;
          if (d.type === 'text_delta' && typeof d.text === 'string') {
            b.text = `${typeof b.text === 'string' ? b.text : ''}${d.text}`;
            onText(d.text);
          } else if (d.type === 'input_json_delta' && typeof d.partial_json === 'string') partial.set(i, (partial.get(i) ?? '') + d.partial_json);
          else if (d.type === 'thinking_delta' && typeof d.thinking === 'string') b.thinking = `${typeof b.thinking === 'string' ? b.thinking : ''}${d.thinking}`;
          else if (d.type === 'signature_delta' && typeof d.signature === 'string') b.signature = d.signature;
          break;
        }
        case 'content_block_stop': {
          const raw = partial.get(i);
          if (b && raw !== undefined) {
            partial.delete(i);
            try {
              b.input = raw ? JSON.parse(raw) : {};
            } catch {
              b.input = {};
              badInput = true;
            }
          }
          break;
        }
        case 'message_delta':
          if (isObj(ev.delta) && typeof ev.delta.stop_reason === 'string') stop = ev.delta.stop_reason;
          take(ev.usage);
          break;
        case 'message_stop':
          finished = true;
          break;
        case 'error': {
          const e = isObj(ev.error) ? ev.error : {};
          const type = typeof e.type === 'string' ? e.type : '', message = typeof e.message === 'string' ? e.message : 'unknown error';
          return fail(errorCode(0, type, message), `the model stream reported ${type || 'an error'}: ${message}`);
        }
      }
    }
  } catch (e) {
    return fail('upstream_error', `the model stream broke: ${why(e)}`);
  }
  if (!finished) return fail('upstream_error', 'the model stream ended before message_stop');
  if (stop === 'refusal') return fail('refused', 'the model declined this request');
  if (stop === 'tool_use' && badInput) return fail('upstream_error', 'a tool call carried input that is not JSON');
  return { content: blocks.filter(Boolean), stop_reason: stop, usage, error: null };
}

export function agentRoutes(config: ServerConfig, db: Db): Hono {
  const r = new Hono();

  r.post('/sample', bodyLimit({ maxSize: LIMITS.bodyBytes, onError: (c) => c.json(err('prompt_too_large', `agent requests are limited to ${LIMITS.bodyBytes >> 20} MiB`), 413) }), async (c) => {
    if (!config.model) return c.json(err('no_model', 'no model is configured for the agent gateway: set KILN_MODEL'), 503);
    if (!config.apiKey) return c.json(err('no_api_key', 'no API key is configured for the agent gateway: set ANTHROPIC_API_KEY'), 503);
    const body = await c.req.json().catch(() => undefined);
    if (body === undefined) return c.json(err('bad_json', 'the body is not JSON'), 400);
    const req = parseSample(body);
    if (typeof req === 'string') return c.json(err('bad_request', req), 400);

    // the page going away (request aborted, or the response stream cancelled) aborts the upstream call
    const upstream = new AbortController();
    const abort = () => upstream.abort();
    c.req.raw.signal.addEventListener('abort', abort, { once: true });
    const enc = new TextEncoder();
    let out!: ReadableStreamDefaultController<Uint8Array>; // start() runs inside the constructor
    const stream = new ReadableStream<Uint8Array>({ start: (ctl) => void (out = ctl), cancel: abort });
    const send = (ev: Json) => {
      try {
        out.enqueue(enc.encode(`${JSON.stringify(ev)}\n`));
      } catch {
        /* the page is gone; the row still records the call */
      }
    };
    void (async () => {
      const t0 = performance.now();
      const o = await callModel(config, req, upstream.signal, (text) => send({ type: 'text', text }));
      let call: number | null = null;
      try {
        call = Number(
          run(
            db,
            `insert into llm_calls (conversation, model, input_tokens, output_tokens, reasoning_tokens, cache_read_tokens, est_prompt_tokens, duration_ms, stop_reason, error, created_at)
             values (?, ?, ?, ?, null, ?, ?, ?, ?, ?, ?)`,
            req.conversation, config.model, o.usage.input_tokens, o.usage.output_tokens, o.usage.cache_read_tokens, estimatePromptTokens(req),
            Math.round(performance.now() - t0), o.stop_reason, o.error?.code ?? null, now(),
          ).lastInsertRowid,
        );
      } catch {
        /* the database is closing; the page still gets its answer */
      }
      if (o.error) send({ type: 'error', code: o.error.code, message: o.error.message, call });
      else send({ type: 'done', message: { role: 'assistant', content: o.content }, stop_reason: o.stop_reason, usage: o.usage, call });
      c.req.raw.signal.removeEventListener('abort', abort);
      try {
        out.close();
      } catch {
        /* already cancelled */
      }
    })();
    return c.body(stream, 200, { 'content-type': 'application/x-ndjson; charset=utf-8' });
  });

  r.get('/usage', (c) =>
    c.json({
      model: config.model,
      ready: Boolean(config.model && config.apiKey),
      totals: all(
        db,
        `select model, count(*) as calls, coalesce(sum(input_tokens), 0) as input_tokens, coalesce(sum(output_tokens), 0) as output_tokens,
                coalesce(sum(cache_read_tokens), 0) as cache_read_tokens, coalesce(sum(est_prompt_tokens), 0) as est_prompt_tokens
           from llm_calls group by model order by model`,
      ),
      conversations: all(
        db,
        `select conversation, model, count(*) as calls, coalesce(sum(input_tokens), 0) as input_tokens, coalesce(sum(output_tokens), 0) as output_tokens,
                max(created_at) as last_at
           from llm_calls where conversation is not null group by conversation, model order by last_at desc limit 50`,
      ),
    }),
  );

  return r;
}
