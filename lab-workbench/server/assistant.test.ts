import type { AssistantMessage, Context } from '@earendil-works/pi-ai';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { parseModelSpec, thinkingLevels, type ModelCatalog, type ModelHandle } from './assistant/model';
import { observationText, splitReply } from './assistant/prompt';
import { PiAssistant } from './assistant/service';
import { loadConfig } from './config';
import { all, openDb } from './db';
import { EventBus } from './events';
import { Runner } from './runner';

/** A model that answers from a script and records every context it was given. */
function fakeModel(replies: (ctx: Context, call: number) => string) {
  const seen: Context[] = [];
  const model: ModelHandle = {
    spec: { provider: 'fake', id: 'scripted-model', thinking: 'high' },
    label: 'fake/scripted-model:high',
    async complete(context, opts) {
      seen.push(context);
      const text = replies(context, seen.length);
      opts.onDelta?.(text);
      return {
        promptChars: (context.systemPrompt?.length ?? 0) + 10,
        text,
        usage: { input: 11, output: 22, reasoning: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 33, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: 'stop',
        error: null,
        durationMs: 3,
      };
    },
    assistantMessage: (text) => ({ role: 'assistant', content: [{ type: 'text', text }] }) as unknown as AssistantMessage,
  };
  return { model, seen };
}

function harness(replies: (ctx: Context, call: number) => string) {
  const db = openDb(':memory:');
  const { model, seen } = fakeModel(replies);
  const used: string[] = [];
  const catalog: ModelCatalog = {
    list: () => [
      { spec: 'fake/scripted-model', provider: 'fake', id: 'scripted-model', name: 'scripted', reasoning: true, thinking: ['low', 'high'], contextWindow: null },
    ],
    handle: (spec) => {
      if (spec.provider !== 'fake' || spec.id !== 'scripted-model') return { ok: false, reason: `pi has no authorized model ${spec.provider}/${spec.id}` };
      used.push(`${spec.provider}/${spec.id}:${spec.thinking}`);
      return { ok: true, model: { ...model, spec, label: `${spec.provider}/${spec.id}:${spec.thinking}` } };
    },
  };
  const assistant = new PiAssistant(db, Promise.resolve({ ok: true as const, catalog }), 'fake/scripted-model:high');
  const app = createApp({ config: loadConfig({ dataDir: '/tmp/unused' }), db, bus: new EventBus(), runner: new Runner(db, new EventBus(), {}), probe: () => undefined, assistant, startedAt: 'now' });
  const json = async (method: string, path: string, body?: unknown) => {
    const res = await app.request(`/api${path}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, json: (await res.json()) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
  /** Reads an SSE response into [event, data] pairs. */
  const sse = async (path: string, body: unknown) => {
    const res = await app.request(`/api${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const text = await res.text();
    return text
      .split('\n\n')
      .filter(Boolean)
      .map((block) => {
        const event = /^event: (.*)$/m.exec(block)?.[1] ?? 'message';
        const data = /^data: (.*)$/m.exec(block)?.[1];
        return [event, data ? JSON.parse(data) : null] as const;
      });
  };
  return { db, seen, used, json, sse, ready: () => new Promise((r) => setTimeout(r, 0)) };
}

describe('assistant transcripts', () => {
  it('stores scripted turns and their results', async () => {
    const h = harness(() => '');
    await h.ready();
    const t = await h.json('POST', '/assistant/turns', { labId: 'l', boardId: 'b', mode: 'scripted', prompt: 'Which runs are invalid?', scripted: { text: 'Checking.', code: 'return 1' } });
    expect(t.status).toBe(200);
    await h.json('POST', `/assistant/messages/${t.json.assistantId}/result`, { status: 'ok', value: '1', logs: [], ms: 2 });
    const conv = await h.json('GET', '/assistant/conversations?lab=l');
    expect(conv.json[0].messages.map((m: { role: string; mode: string }) => `${m.role}:${m.mode}`)).toEqual(['user:scripted', 'assistant:scripted', 'observation:scripted']);
    expect(conv.json[0].messages[1].result).toMatchObject({ status: 'ok', value: '1' });
    expect(all(h.db, 'select * from llm_calls')).toEqual([]);
  });

  it('runs a live turn, feeds the code result back and stores every model call with its tokens', async () => {
    const h = harness((_ctx, call) => (call === 1 ? 'Counting runs.\n```js\nreturn self.runs().length\n```' : 'There are 14 runs; none is invalid.'));
    await h.ready();
    const first = await h.sse('/assistant/turns', { labId: 'l', boardId: 'b', mode: 'live', prompt: 'How many runs?', context: { board: { id: 'b' } } });
    const reply = first.find(([e]) => e === 'reply')![1];
    expect(reply).toMatchObject({ text: 'Counting runs.', code: 'return self.runs().length', run: true, step: 1, usage: { input: 11, output: 22, reasoning: 5, total: 33 } });
    expect(h.seen[0].systemPrompt).toContain('"board"');
    const second = await h.sse(`/assistant/messages/${reply.id}/result`, { status: 'ok', value: '14', logs: [], ms: 1, continue: true, context: {} });
    expect(second.find(([e]) => e === 'reply')![1]).toMatchObject({ text: 'There are 14 runs; none is invalid.', code: null, run: false, step: 2 });
    // the model saw its own code and the observation as conversation history
    const history = h.seen[1].messages.map((m) => (typeof m.content === 'string' ? m.content : (m.content as { text: string }[])[0].text));
    expect(history[1]).toContain('```js');
    expect(history[2]).toContain('return value:\n14');
    const calls = all<{ input_tokens: number; output_tokens: number; est_prompt_tokens: number; model: string }>(h.db, 'select * from llm_calls order by id');
    expect(calls.map((c) => [c.model, c.input_tokens, c.output_tokens])).toEqual([
      ['scripted-model', 11, 22],
      ['scripted-model', 11, 22],
    ]);
    expect(calls.every((c) => c.est_prompt_tokens > 0)).toBe(true);
  });

  it('stops after four executions and says so in the last observation', async () => {
    const h = harness(() => 'More.\n```js\nreturn 1\n```');
    await h.ready();
    let events = await h.sse('/assistant/turns', { labId: 'l', boardId: 'b', mode: 'live', prompt: 'Loop', context: {} });
    const steps: { step: number; run: boolean }[] = [];
    for (;;) {
      const r = events.find(([e]) => e === 'reply')![1];
      steps.push({ step: r.step, run: r.run });
      if (!r.run) break;
      events = await h.sse(`/assistant/messages/${r.id}/result`, { status: 'ok', value: '1', continue: true, context: {} });
    }
    expect(steps).toEqual([1, 2, 3, 4].map((step) => ({ step, run: true })).concat([{ step: 5, run: false }]));
    const lastMessages = h.seen[4].messages;
    expect(String(lastMessages[lastMessages.length - 1].content)).toContain('That was your last code execution');
  });
});

describe('model selection and the transcript library', () => {
  it('uses the model the browser chose and refuses one pi has no credentials for', async () => {
    const h = harness(() => 'Done.');
    await h.ready();
    const models = await h.json('GET', '/assistant/models');
    expect(models.json).toMatchObject({ available: true, model: 'fake/scripted-model:high', default: 'fake/scripted-model:high', models: [{ spec: 'fake/scripted-model', thinking: ['low', 'high'] }] });
    const ok = await h.sse('/assistant/turns', { labId: 'l', boardId: 'b', mode: 'live', prompt: 'Hi', model: 'fake/scripted-model:low', context: {} });
    expect(ok.find(([e]) => e === 'reply')![1].model).toBe('fake/scripted-model:low');
    expect(h.used.at(-1)).toBe('fake/scripted-model:low');
    const refused = await h.json('POST', '/assistant/turns', { labId: 'l', boardId: 'b', mode: 'live', prompt: 'Hi', model: 'openai/gpt-x:high', context: {} });
    expect(refused).toMatchObject({ status: 503, json: { error: 'unavailable', message: 'pi has no authorized model openai/gpt-x' } });
  });

  it('archives on clear, lists, restores and deletes transcripts', async () => {
    const h = harness(() => 'Answer.');
    await h.ready();
    await h.json('POST', '/assistant/turns', { labId: 'l', boardId: 'b1', mode: 'scripted', prompt: 'First question', scripted: { text: 'one' } });
    await h.json('POST', '/assistant/turns', { labId: 'l', boardId: 'b2', mode: 'scripted', prompt: 'Other board', scripted: { text: 'two' } });
    expect((await h.json('POST', '/assistant/archive', { labId: 'l' })).json).toEqual({ archived: 2 });
    expect((await h.json('GET', '/assistant/conversations?lab=l')).json).toEqual([]);
    await h.json('POST', '/assistant/turns', { labId: 'l', boardId: 'b1', mode: 'scripted', prompt: 'After clearing', scripted: { text: 'three' } });
    const lib = (await h.json('GET', '/assistant/library?lab=l')).json as { id: string; title: string; archivedAt: string | null; messages: number }[];
    expect(lib.map((x) => [x.title, Boolean(x.archivedAt), x.messages])).toEqual([
      ['After clearing', false, 2],
      ['Other board', true, 2],
      ['First question', true, 2],
    ]);
    expect((await h.json('GET', '/assistant/library?q=board')).json.map((x: { title: string }) => x.title)).toEqual(['Other board']);
    const first = lib.find((x) => x.title === 'First question')!;
    await h.json('POST', `/assistant/library/${first.id}/restore`);
    const active = (await h.json('GET', '/assistant/conversations?lab=l')).json as { id: string; boardId: string }[];
    expect(active.map((c) => c.id)).toEqual([first.id]); // restoring archived the board's newer conversation
    const del = await h.json('DELETE', `/assistant/library/${first.id}`);
    expect(del.json).toMatchObject({ deleted: first.id, messages: 2 });
    expect(all(h.db, 'select * from messages where conversation_id = ?', first.id)).toEqual([]);
  });
});

describe('model specs', () => {
  it('parses provider/id[:thinking] with medium as the default level', () => {
    expect(parseModelSpec('lunaroute/deepseek-4.1-flash:high')).toEqual({ provider: 'lunaroute', id: 'deepseek-4.1-flash', thinking: 'high' });
    expect(parseModelSpec('openai-codex/gpt-5.5')).toEqual({ provider: 'openai-codex', id: 'gpt-5.5', thinking: 'medium' });
    expect(() => parseModelSpec('no-provider')).toThrow(/provider\/id/);
  });

  it('offers the standard thinking levels unless pi marks one unsupported, and extended ones only when mapped', () => {
    expect(thinkingLevels({ reasoning: false })).toEqual(['off']);
    expect(thinkingLevels({ reasoning: true })).toEqual(['off', 'minimal', 'low', 'medium', 'high']);
    const mapped = { reasoning: true, thinkingLevelMap: { minimal: null, xhigh: 'xhigh' } } as unknown as Parameters<typeof thinkingLevels>[0];
    expect(thinkingLevels(mapped)).toEqual(['off', 'low', 'medium', 'high', 'xhigh']);
  });
});

describe('reply parsing', () => {
  it('finds code in a fence opened mid-line', () => {
    expect(splitReply('Let me look. ```js const n = 1; return n;```')).toEqual({ text: 'Let me look.', code: 'const n = 1; return n;' });
    // what follows the block was written without its result and is dropped
    expect(splitReply('Checking.\n```js\nreturn 1\n```\n<observation>1</observation>\nSo the answer is 1.')).toEqual({ text: 'Checking.', code: 'return 1' });
    expect(splitReply('Plain answer.')).toEqual({ text: 'Plain answer.', code: null });
    expect(splitReply('Looking.\n<observation>awaiting</observation>\n```js\nreturn 2\n```')).toEqual({ text: 'Looking.', code: 'return 2' });
  });

  it('truncates long observations and says so', () => {
    const t = observationText({ status: 'ok', value: 'x'.repeat(9000) });
    expect(t).toMatch(/truncated: the result was \d+ characters/);
  });
});
