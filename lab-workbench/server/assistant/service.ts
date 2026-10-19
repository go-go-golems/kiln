import type { Message } from '@earendil-works/pi-ai';
import type { Context as HonoContext, Hono } from 'hono';
import { streamSSE, type SSEStreamingApi } from 'hono/streaming';
import { all, get, now, run, tx, type Db } from '../db';
import { parseModelSpec, type CompletionResult, type ModelCatalog, type ModelHandle } from './model';
import { observationText, splitReply, systemPrompt, type BoardContext } from './prompt';

/** The live assistant: model access through pi, the turn protocol and transcript persistence. */
export interface AssistantService {
  status(): { available: boolean; model?: string; reason?: string };
  mount(app: Hono): void;
}

const MAX_STEPS = 4;
const HISTORY = 24;

interface MessageRow {
  id: string;
  conversation_id: string;
  seq: number;
  role: 'user' | 'assistant' | 'observation';
  mode: 'scripted' | 'live';
  content: string;
  code: string | null;
  result_json: string | null;
  status: string | null;
  created_at: string;
}

interface ConversationRow {
  id: string;
  lab_id: string;
  board_id: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

const newId = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export class PiAssistant implements AssistantService {
  private catalog: ModelCatalog | null = null;
  private reason = 'starting';
  private readonly busy = new Set<string>();

  constructor(
    private readonly db: Db,
    catalogPromise: Promise<{ ok: true; catalog: ModelCatalog } | { ok: false; reason: string }>,
    private readonly defaultModel: string,
  ) {
    void catalogPromise.then((r) => {
      if (r.ok) this.catalog = r.catalog;
      else this.reason = r.reason;
    });
  }

  status() {
    if (!this.catalog) return { available: false, model: this.defaultModel, reason: this.reason };
    const d = this.resolve(undefined);
    return d.ok ? { available: true, model: d.model.label } : { available: false, model: this.defaultModel, reason: d.reason };
  }

  /** The requested model (provider/id:thinking) or the configured default, if pi has credentials for it. */
  private resolve(spec: unknown): { ok: true; model: ModelHandle } | { ok: false; reason: string } {
    if (!this.catalog) return { ok: false, reason: `live model unavailable: ${this.reason}` };
    try {
      return this.catalog.handle(parseModelSpec(typeof spec === 'string' && spec ? spec : this.defaultModel));
    } catch (e) {
      return { ok: false, reason: (e as Error).message };
    }
  }

  // ── persistence ─────────────────────────────────────────────────────────────────────────
  /** The active conversation of a board; a cleared board starts a new one. */
  private conversation(labId: string, boardId: string): string {
    const row = get<{ id: string }>(this.db, 'select id from conversations where lab_id = ? and board_id = ? and archived_at is null', labId, boardId);
    if (row) return row.id;
    const id = newId('c');
    run(this.db, 'insert into conversations (id, lab_id, board_id, created_at, updated_at) values (?, ?, ?, ?, ?)', id, labId, boardId, now(), now());
    return id;
  }

  private addMessage(conversationId: string, m: { role: MessageRow['role']; mode: MessageRow['mode']; content: string; code?: string | null; result?: unknown; status?: string | null }): string {
    const id = newId('m');
    const seq = (get<{ n: number | null }>(this.db, 'select max(seq) as n from messages where conversation_id = ?', conversationId)?.n ?? 0) + 1;
    run(
      this.db,
      'insert into messages (id, conversation_id, seq, role, mode, content, code, result_json, status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id,
      conversationId,
      seq,
      m.role,
      m.mode,
      m.content,
      m.code ?? null,
      m.result === undefined ? null : JSON.stringify(m.result),
      m.status ?? null,
      now(),
    );
    run(this.db, 'update conversations set updated_at = ? where id = ?', now(), conversationId);
    return id;
  }

  private recordCall(conversationId: string, messageId: string | null, model: ModelHandle, r: CompletionResult) {
    const u = r.usage;
    run(
      this.db,
      `insert into llm_calls (conversation_id, message_id, provider, model, thinking, input_tokens, output_tokens, reasoning_tokens, cache_read_tokens, cache_write_tokens, total_tokens, duration_ms, stop_reason, error, created_at, prompt_chars, est_prompt_tokens)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      conversationId,
      messageId,
      model.spec.provider,
      model.spec.id,
      model.spec.thinking,
      u?.input ?? null,
      u?.output ?? null,
      u?.reasoning ?? null,
      u?.cacheRead ?? null,
      u?.cacheWrite ?? null,
      u?.totalTokens ?? null,
      r.durationMs,
      r.stopReason,
      r.error,
      now(),
      r.promptChars,
      // about four characters per token for English and code; an estimate, labelled as one wherever shown
      Math.ceil(r.promptChars / 4),
    );
  }

  private messagesOf(conversationId: string) {
    return all<MessageRow>(this.db, 'select * from messages where conversation_id = ? order by seq', conversationId).map((m) => ({
      id: m.id,
      seq: m.seq,
      role: m.role,
      mode: m.mode,
      content: m.content,
      code: m.code,
      result: m.result_json ? JSON.parse(m.result_json) : null,
      status: m.status,
      createdAt: m.created_at,
      usage:
        get<Record<string, number | string | null>>(
          this.db,
          `select provider, model, thinking, input_tokens as input, output_tokens as output, reasoning_tokens as reasoning, total_tokens as total, est_prompt_tokens as estPrompt, duration_ms as ms from llm_calls where message_id = ?`,
          m.id,
        ) ?? null,
    }));
  }

  private summary(c: ConversationRow) {
    const counts = get<{ messages: number; prompts: number | null; live: number | null }>(
      this.db,
      `select count(*) as messages, sum(role = 'user') as prompts, sum(mode = 'live' and role = 'assistant') as live from messages where conversation_id = ?`,
      c.id,
    );
    const first = get<{ content: string }>(this.db, `select content from messages where conversation_id = ? and role = 'user' order by seq limit 1`, c.id);
    const tokens = get<Record<string, number | null>>(
      this.db,
      `select count(*) as calls, sum(input_tokens) as input, sum(output_tokens) as output, sum(reasoning_tokens) as reasoning, sum(est_prompt_tokens) as estPrompt from llm_calls where conversation_id = ?`,
      c.id,
    );
    const models = all<{ m: string }>(this.db, `select distinct provider || '/' || model || ':' || coalesce(thinking, '') as m from llm_calls where conversation_id = ?`, c.id).map((r) => r.m);
    return {
      id: c.id,
      labId: c.lab_id,
      boardId: c.board_id,
      title: first?.content.slice(0, 160) ?? null,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      archivedAt: c.archived_at,
      messages: counts?.messages ?? 0,
      prompts: counts?.prompts ?? 0,
      liveReplies: counts?.live ?? 0,
      tokens,
      models,
    };
  }

  // ── model turns ─────────────────────────────────────────────────────────────────────────
  private history(conversationId: string, model: ModelHandle): Message[] {
    const rows = all<MessageRow>(this.db, 'select * from messages where conversation_id = ? order by seq desc limit ?', conversationId, HISTORY).reverse();
    return rows.map((m): Message => {
      if (m.role === 'assistant') return model.assistantMessage(m.code ? `${m.content}\n\n\`\`\`js\n${m.code}\n\`\`\`` : m.content);
      return { role: 'user', content: m.content, timestamp: Date.parse(m.created_at) };
    });
  }

  private stepsSinceUser(conversationId: string): number {
    const rows = all<{ role: string }>(this.db, 'select role from messages where conversation_id = ? order by seq desc limit 20', conversationId);
    let n = 0;
    for (const r of rows) {
      if (r.role === 'user') break;
      if (r.role === 'assistant') n++;
    }
    return n;
  }

  /** One model call, streamed to the browser, stored with its token usage. */
  private async reply(stream: SSEStreamingApi, conversationId: string, model: ModelHandle, context: BoardContext, signal: AbortSignal) {
    const step = this.stepsSinceUser(conversationId) + 1;
    const r = await model.complete(
      { systemPrompt: systemPrompt(context, { final: step > MAX_STEPS }), messages: this.history(conversationId, model) },
      { signal, onDelta: (d) => void stream.writeSSE({ event: 'delta', data: JSON.stringify({ text: d }) }) },
    );
    if (r.error && !r.text) {
      this.recordCall(conversationId, null, model, r);
      await stream.writeSSE({ event: 'error', data: JSON.stringify({ message: r.error }) });
      return;
    }
    const { text, code } = splitReply(r.text);
    // the last allowed step may not ask for more evidence: its code is kept but marked not to run
    const runnable = code && step <= MAX_STEPS ? code : null;
    const id = this.addMessage(conversationId, { role: 'assistant', mode: 'live', content: text, code, status: code ? (runnable ? 'pending' : 'skipped') : null });
    this.recordCall(conversationId, id, model, r);
    await stream.writeSSE({
      event: 'reply',
      data: JSON.stringify({
        id,
        text,
        code,
        run: Boolean(runnable),
        step,
        model: model.label,
        usage: r.usage ? { input: r.usage.input, output: r.usage.output, reasoning: r.usage.reasoning ?? null, total: r.usage.totalTokens, estPrompt: Math.ceil(r.promptChars / 4) } : null,
        ms: r.durationMs,
      }),
    });
  }

  private sse(c: HonoContext, conversationId: string, work: (stream: SSEStreamingApi, signal: AbortSignal) => Promise<void>) {
    if (this.busy.has(conversationId)) return c.json({ error: 'busy', message: 'the assistant is already answering on this board' }, 409);
    this.busy.add(conversationId);
    return streamSSE(c, async (stream) => {
      const ctl = new AbortController();
      stream.onAbort(() => ctl.abort());
      try {
        await work(stream, ctl.signal);
      } catch (e) {
        await stream.writeSSE({ event: 'error', data: JSON.stringify({ message: (e as Error).message }) });
      } finally {
        this.busy.delete(conversationId);
        await stream.writeSSE({ event: 'end', data: '{}' });
      }
    });
  }

  mount(app: Hono) {
    app.get('/assistant/models', (c) => {
      const s = this.status();
      return c.json({ ...s, default: this.defaultModel, models: this.catalog?.list() ?? [] });
    });

    /** The lab's active conversations (all boards), as the Agent tab shows them. */
    app.get('/assistant/conversations', (c) => {
      const lab = c.req.query('lab') ?? '';
      const convs = all<ConversationRow>(this.db, 'select * from conversations where lab_id = ? and archived_at is null order by created_at', lab);
      return c.json(convs.map((conv) => ({ id: conv.id, boardId: conv.board_id, messages: this.messagesOf(conv.id) })));
    });

    /** The transcript library: every conversation with messages, newest first, optionally one lab's or matching a search. */
    app.get('/assistant/library', (c) => {
      const lab = c.req.query('lab');
      const q = (c.req.query('q') ?? '').trim();
      const limit = Math.min(200, Math.max(1, Number(c.req.query('limit') ?? 100) || 100));
      const params: (string | number)[] = [];
      let where = 'exists (select 1 from messages m where m.conversation_id = conversations.id)';
      if (lab) {
        where += ' and lab_id = ?';
        params.push(lab);
      }
      if (q) {
        where += ` and id in (select conversation_id from messages where content like ? escape '\\' or code like ? escape '\\')`;
        const like = `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
        params.push(like, like);
      }
      const convs = all<ConversationRow>(this.db, `select * from conversations where ${where} order by updated_at desc limit ?`, ...params, limit);
      return c.json(convs.map((conv) => this.summary(conv)));
    });

    app.get('/assistant/library/:id', (c) => {
      const conv = get<ConversationRow>(this.db, 'select * from conversations where id = ?', c.req.param('id'));
      if (!conv) return c.json({ error: 'not_found', message: 'no such transcript' }, 404);
      return c.json({ ...this.summary(conv), transcript: this.messagesOf(conv.id) });
    });

    /** Clear: archive the active conversations of a lab (or of one board); they stay in the library. */
    app.post('/assistant/archive', async (c) => {
      const b = (await c.req.json().catch(() => null)) as { labId?: unknown; boardId?: unknown } | null;
      if (typeof b?.labId !== 'string') return c.json({ error: 'bad_request', message: 'labId is required' }, 400);
      const at = now();
      const res =
        typeof b.boardId === 'string'
          ? run(this.db, 'update conversations set archived_at = ? where lab_id = ? and board_id = ? and archived_at is null', at, b.labId, b.boardId)
          : run(this.db, 'update conversations set archived_at = ? where lab_id = ? and archived_at is null', at, b.labId);
      return c.json({ archived: Number(res.changes) });
    });

    /** Continue an archived transcript: it becomes its board's active conversation again. */
    app.post('/assistant/library/:id/restore', (c) => {
      const conv = get<ConversationRow>(this.db, 'select * from conversations where id = ?', c.req.param('id'));
      if (!conv) return c.json({ error: 'not_found', message: 'no such transcript' }, 404);
      if (this.busy.has(conv.id)) return c.json({ error: 'busy', message: 'the assistant is answering in this transcript' }, 409);
      tx(this.db, () => {
        run(this.db, 'update conversations set archived_at = ? where lab_id = ? and board_id = ? and archived_at is null and id <> ?', now(), conv.lab_id, conv.board_id, conv.id);
        run(this.db, 'update conversations set archived_at = null, updated_at = ? where id = ?', now(), conv.id);
      });
      return c.json(this.summary(get<ConversationRow>(this.db, 'select * from conversations where id = ?', conv.id)!));
    });

    /** Delete a transcript with its messages and model-call records. */
    app.delete('/assistant/library/:id', (c) => {
      const conv = get<ConversationRow>(this.db, 'select * from conversations where id = ?', c.req.param('id'));
      if (!conv) return c.json({ error: 'not_found', message: 'no such transcript' }, 404);
      if (this.busy.has(conv.id)) return c.json({ error: 'busy', message: 'the assistant is answering in this transcript' }, 409);
      const s = this.summary(conv);
      run(this.db, 'delete from conversations where id = ?', conv.id);
      return c.json({ deleted: conv.id, messages: s.messages, calls: s.tokens?.calls ?? 0 });
    });

    app.post('/assistant/turns', async (c) => {
      const b = (await c.req.json().catch(() => null)) as {
        labId?: unknown;
        boardId?: unknown;
        mode?: unknown;
        prompt?: unknown;
        context?: unknown;
        model?: unknown;
        scripted?: { text?: unknown; code?: unknown };
      } | null;
      if (typeof b?.labId !== 'string' || typeof b.boardId !== 'string' || typeof b.prompt !== 'string' || !b.prompt.trim() || b.prompt.length > 4000)
        return c.json({ error: 'bad_request', message: 'labId, boardId and a prompt of at most 4000 characters are required' }, 400);
      const conversationId = this.conversation(b.labId, b.boardId);
      if (b.mode === 'scripted') {
        const userId = this.addMessage(conversationId, { role: 'user', mode: 'scripted', content: b.prompt });
        const assistantId = this.addMessage(conversationId, {
          role: 'assistant',
          mode: 'scripted',
          content: typeof b.scripted?.text === 'string' ? b.scripted.text : '',
          code: typeof b.scripted?.code === 'string' ? b.scripted.code : null,
          status: typeof b.scripted?.code === 'string' ? 'pending' : null,
        });
        return c.json({ conversationId, userId, assistantId });
      }
      const m = this.resolve(b.model);
      if (!m.ok) return c.json({ error: 'unavailable', message: m.reason }, 503);
      const context = (b.context && typeof b.context === 'object' ? b.context : {}) as BoardContext;
      return this.sse(c, conversationId, async (stream, signal) => {
        const userId = this.addMessage(conversationId, { role: 'user', mode: 'live', content: b.prompt as string });
        await stream.writeSSE({ event: 'stored', data: JSON.stringify({ conversationId, userId }) });
        await this.reply(stream, conversationId, m.model, context, signal);
      });
    });

    app.post('/assistant/messages/:id/result', async (c) => {
      const msg = get<MessageRow>(this.db, 'select * from messages where id = ?', c.req.param('id'));
      if (!msg || msg.role !== 'assistant') return c.json({ error: 'not_found', message: 'no such assistant message' }, 404);
      const b = (await c.req.json().catch(() => null)) as { status?: unknown; value?: unknown; error?: unknown; logs?: unknown; ms?: unknown; continue?: unknown; context?: unknown; model?: unknown } | null;
      const result = {
        status: b?.status === 'ok' ? 'ok' : 'rolled_back',
        value: typeof b?.value === 'string' ? b.value.slice(0, 20_000) : undefined,
        error: typeof b?.error === 'string' ? b.error.slice(0, 4000) : undefined,
        logs: Array.isArray(b?.logs) ? (b.logs as unknown[]).map(String).slice(0, 200) : [],
        ms: typeof b?.ms === 'number' ? b.ms : undefined,
      };
      run(this.db, 'update messages set status = ?, result_json = ? where id = ?', result.status, JSON.stringify(result), msg.id);
      // the instruction to stop rides on the newest message, where models weigh it most
      const last = this.stepsSinceUser(msg.conversation_id) >= MAX_STEPS;
      this.addMessage(msg.conversation_id, { role: 'observation', mode: msg.mode, content: observationText(result, { last }), result, status: result.status });
      if (b?.continue !== true || msg.mode !== 'live') return c.json({ ok: true });
      const m = this.resolve(b.model);
      if (!m.ok) return c.json({ error: 'unavailable', message: m.reason }, 503);
      const context = (b.context && typeof b.context === 'object' ? b.context : {}) as BoardContext;
      return this.sse(c, msg.conversation_id, (stream, signal) => this.reply(stream, msg.conversation_id, m.model, context, signal));
    });
  }
}
