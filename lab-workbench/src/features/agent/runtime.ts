import type { AppDispatch, RootState } from '@/app/store';
import { store } from '@/app/store';
import { addPatch, getPatches, getRegistry, setPatches } from '@/app/registry';
import { alternativeAdded, restoreAnnotations } from '@/features/annotations/annotationsSlice';
import { buildLab } from '@/features/build/thunks';
import { proposeJob } from '@/features/jobs/thunks';
import { restoreLab } from '@/features/params/paramsSlice';
import { changeParam } from '@/features/params/thunks';
import { select } from '@/features/selection/selectionSlice';
import { restoreSignals, setSignal } from '@/features/signals/signalsSlice';
import type { ExperimentB, LabB } from '@/lang/builders';
import { createLibrary } from '@/lang/library';
import { isEnt, rows, type Ent, type EntityKind } from '@/lang/rows';
import { dehydrate, paramValue, queryEnv, readDerive, rehydrate, type BuildRegistry } from '@/lang/runtime';
import { isQuery } from '@/lang/query';
import { isValue } from '@/lang/values';
import { presetById } from '@/presets';
import { clearTurns, setView, transcriptLoaded, transcriptStale, turnAdded, turnText, turnUpdated, type EvalResult, type TokenUsage, type Turn } from './agentSlice';
import { log } from '@/features/ui/uiSlice';
import { boardContext } from './context';
import { server, streamPost } from '@/services/server';
import { ASSISTANT, BUILTIN_REPLIES } from './builtins';
import type { IR } from '@/lang/ir';

type GetState = () => RootState;
const AsyncFunction = Object.getPrototypeOf(async () => undefined).constructor as new (...args: string[]) => (...a: unknown[]) => Promise<unknown>;
const TIMEOUT_MS = 10 * 60 * 1000;
let turnSeq = 0;
const cancels = new Map<string, () => void>();

export interface ScriptedReply {
  prompt: string;
  text: string;
  code: string;
}

/** Lattice's reply format, keyed by board: `=== <board id>`, `> prompt`, prose, then one fenced js block. */
export function parseReplies(text: string): Map<string, ScriptedReply[]> {
  const out = new Map<string, ScriptedReply[]>();
  let cur: (ScriptedReply & { inCode: boolean }) | null = null;
  for (const line of text.split('\n')) {
    const head = /^===\s+(\S+)\s*$/.exec(line);
    if (head) {
      cur = { prompt: '', text: '', code: '', inCode: false };
      out.set(head[1], [...(out.get(head[1]) ?? []), cur]);
      continue;
    }
    if (!cur) continue;
    if (!cur.inCode && line.startsWith('```')) {
      cur.inCode = true;
      continue;
    }
    if (cur.inCode && line.startsWith('```')) {
      cur.inCode = false;
      continue;
    }
    if (cur.inCode) cur.code += `${line}\n`;
    else if (!cur.text && line.startsWith('>')) cur.prompt += `${cur.prompt ? ' ' : ''}${line.replace(/^>\s?/, '')}`;
    else if (line.trim()) cur.text += `${cur.text ? ' ' : ''}${line.trim()}`;
  }
  return out;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/[?.!]+$/, '');

/**
 * The result of assistant code as JSON text the UI shows as YAML or JSON and the model reads as an
 * observation. It is always valid JSON: size is bounded by shrinking the structure (items, keys, depth,
 * string length), never by cutting the text.
 */
export function inspect(v: unknown, depth = 0): string {
  if (typeof v === 'string') return JSON.stringify(v.length > 4000 ? `${v.slice(0, 4000)}… (${v.length} characters)` : v);
  const attempt = (items: number, keys: number, maxDepth: number, chars: number) => {
    const walk = (x: unknown, d: number): unknown => {
      if (d > maxDepth) return '…';
      if (isEnt(x)) return `${x.kind}:${x.ref.split('!').pop()}`;
      if (isValue(x)) return x.value === null ? `missing(${x.reason ?? ''})` : `${String(x.value)}${x.unit ? ` ${x.unit}` : ''}`;
      if (typeof x === 'function') return 'ƒ';
      if (typeof x === 'string') return x.length > chars ? `${x.slice(0, chars)}…` : x;
      if (typeof x === 'number' && !Number.isFinite(x)) return String(x);
      if (Array.isArray(x)) return x.slice(0, items).map((y) => walk(y, d + 1)).concat(x.length > items ? [`… ${x.length - items} more`] : []);
      if (x && typeof x === 'object') {
        const entries = Object.entries(x);
        const out = Object.fromEntries(entries.slice(0, keys).map(([k, y]) => [k, walk(y, d + 1)]));
        if (entries.length > keys) out['…'] = `${entries.length - keys} more keys`;
        return out;
      }
      return x;
    };
    return JSON.stringify(walk(v, depth), null, 2) ?? 'null';
  };
  for (const [items, keys, maxDepth, chars] of [[20, 30, 4, 600], [10, 15, 3, 200], [5, 8, 2, 80]] as const) {
    const s = attempt(items, keys, maxDepth, chars);
    if (s.length <= 8000) return s;
  }
  return attempt(3, 5, 1, 40);
}

interface Snapshot {
  params: RootState['params']['byLab'][string] | undefined;
  signals: Record<string, unknown> | undefined;
  annotations: RootState['annotations']['byLab'][string] | undefined;
  patches: ReturnType<typeof getPatches>;
}

function takeSnapshot(getState: GetState, labId: string): Snapshot {
  const s = getState();
  return {
    params: s.params.byLab[labId],
    signals: s.signals.byLab[labId],
    annotations: s.annotations.byLab[labId],
    patches: getPatches(labId).slice(),
  };
}

function restoreSnapshot(dispatch: AppDispatch, labId: string, snap: Snapshot) {
  dispatch(restoreLab({ labId, snapshot: snap.params ?? { values: {}, applied: {}, pending: null } }));
  dispatch(restoreSignals({ labId, values: snap.signals ?? {} }));
  dispatch(restoreAnnotations({ labId, value: snap.annotations ?? {} }));
  if (getPatches(labId).length !== snap.patches.length) {
    setPatches(labId, snap.patches);
    dispatch(buildLab(labId, 'rollback'));
  }
}

function waitFor<T>(check: () => T | undefined, fail?: () => string | undefined): Promise<T> {
  return new Promise((resolve, reject) => {
    const test = () => {
      const f = fail?.();
      if (f) {
        unsub();
        reject(new Error(f));
        return true;
      }
      const v = check();
      if (v !== undefined) {
        unsub();
        resolve(v);
        return true;
      }
      return false;
    };
    const unsub = store.subscribe(() => void test());
    test();
  });
}

/** The direct handle API given to agent code (design/02 §10). */
function makeHandles(dispatch: AppDispatch, getState: GetState, labId: string, boardId: string, onJob: (id: string) => void) {
  const agentName = ASSISTANT.name;
  const reg = (): BuildRegistry => {
    const r = getRegistry(getState().build.byLab[labId]?.buildId ?? undefined);
    if (!r) throw new Error('the lab has no successful build');
    return r;
  };
  const ir = () => {
    const i = getState().build.byLab[labId]?.ir;
    if (!i) throw new Error('the lab has no successful build');
    return i;
  };

  const runHandle = (run: Ent) => {
    const r = reg();
    return {
      ref: run.ref,
      experiment: run.experiment as string,
      arm: run.arm as string,
      mode: run.mode as string,
      rep: run.rep as number,
      host: run.host as string,
      /** false for a run measured on a real host */
      synthetic: run.synthetic !== false,
      entity: run,
      manifest: run.manifest,
      validity: run.validity as { ok: boolean; reasons: string[] },
      activation: run.activation as Record<string, string>,
      coverage: run.coverage,
      quality: run.quality,
      get requests() {
        return rows(r.source.entities('request', run.ref));
      },
      get kernels() {
        return rows(r.source.entities('kernel', run.ref));
      },
      /** process-level samples such as getrusage counters (type 'rusage') or allocator peaks */
      get instants() {
        return rows(r.source.entities('instant', run.ref));
      },
      /** any entity kind of this run: request, span, kernel, tensor, alloc, instant, … */
      entities(kind: EntityKind) {
        return rows(r.source.entities(kind, run.ref));
      },
      kernel(sel: { role?: string; name?: string; selected?: boolean } = {}) {
        const k = r.source.entities('kernel', run.ref).find((x) => (!sel.role || x.role === sel.role) && (!sel.name || x.name === sel.name) && (sel.selected === undefined || Boolean(x.selected) === sel.selected));
        if (!k) throw new Error(`no kernel matching ${JSON.stringify(sel)} in ${run.ref}`);
        return k;
      },
    };
  };

  const jobHandle = (id: string) => {
    const job = () => getState().jobs.list.find((j) => j.id === id)!;
    let approved: Promise<boolean> | undefined;
    let done: Promise<boolean> | undefined;
    return {
      id,
      get status() {
        return job().status;
      },
      get captures() {
        return job().captures;
      },
      get host() {
        return job().host;
      },
      get budget() {
        return job().budget;
      },
      get approved() {
        return (approved ??= waitFor(
          () => (job().status !== 'proposed' && job().status !== 'cancelled' ? true : undefined),
          () => (job().status === 'cancelled' ? `${id} was declined` : undefined),
        ));
      },
      get done() {
        return (done ??= waitFor(
          () => (job().status === 'done' ? true : undefined),
          () => (job().status === 'cancelled' || job().status === 'failed' ? `${id} ${job().status}` : undefined),
        ));
      },
      events: {
        async *[Symbol.asyncIterator]() {
          let seen = 0;
          while (true) {
            const j = await waitFor(() => {
              const cur = job();
              return cur.events.length > seen || ['done', 'cancelled', 'failed'].includes(cur.status) ? cur : undefined;
            });
            while (seen < j.events.length) yield j.events[seen++];
            if (['done', 'cancelled', 'failed'].includes(j.status)) return;
          }
        },
      },
    };
  };

  const experimentHandle = (id: string) => ({
    id,
    get spec() {
      return ir().experiments.find((e) => e.id === id);
    },
    fork(newId: string, fn?: (e: ExperimentB) => unknown) {
      if (!ir().experiments.some((e) => e.id === id)) throw new Error(`unknown experiment ${id}`);
      addPatch(labId, {
        id: `fork:${newId}`,
        label: `fork ${id} → ${newId} (by ${agentName})`,
        apply: (lab: LabB) => {
          const base = lab.experiments.find((e) => e.id === id);
          if (base && !lab.experiments.some((e) => e.id === newId)) base.fork(newId, fn);
        },
      });
      dispatch(buildLab(labId, `agent fork ${newId}`));
      return experimentHandle(newId);
    },
    patch(fn: (e: ExperimentB) => unknown) {
      addPatch(labId, {
        id: `patch:${id}:${Date.now()}`,
        label: `patch ${id} (by ${agentName})`,
        apply: (lab: LabB) => {
          const e = lab.experiments.find((x) => x.id === id);
          if (e) fn(e);
        },
      });
      dispatch(buildLab(labId, `agent patch ${id}`));
      return experimentHandle(id);
    },
    plan() {
      const caps = ir().plan.captures.filter((c) => c.experiment === id);
      return {
        captures: caps,
        execute: caps.filter((c) => c.status === 'execute'),
        import: caps.filter((c) => c.status === 'import'),
        blocked: caps.filter((c) => c.status === 'blocked'),
        cached: caps.filter((c) => c.status === 'cached'),
      };
    },
  });

  const runtimeState = () => ({ params: getState().params.byLab[labId]?.applied ?? {}, signals: getState().signals.byLab[labId] ?? {} });
  const lab = {
    get ir() {
      return ir();
    },
    /** The rows of a declared derive, computed with the applied parameters (derived values). */
    derive(name: string) {
      return readDerive(reg(), name, runtimeState());
    },
    /** Evaluates a lazy query (q.requests(...).where(...)) against the imported runs. */
    query(query: unknown) {
      if (!isQuery(query)) throw new TypeError('lab.query() expects a query such as q.requests(pattern)');
      return query.evaluate(queryEnv(reg(), runtimeState()));
    },
    runs: {
      find(pattern: string) {
        return rows(reg().source.runs(pattern).map(runHandle));
      },
    },
    run(ref: string) {
      const r = reg().source.entity(ref.includes('#') ? ref : `${ref}#0`);
      if (!r || r.kind !== 'run') throw new Error(`no imported run ${ref}`);
      return runHandle(r);
    },
    experiment: experimentHandle,
    hypothesis(id: string) {
      const h = reg().hypotheses.get(id);
      if (!h) throw new Error(`unknown hypothesis ${id}`);
      return {
        id,
        claim: h.claimText,
        alternatives: {
          list: () => [...h.alternativesList, ...(getState().annotations.byLab[labId]?.[id]?.alternatives.map((a) => a.text) ?? [])],
          add(text: string, opts: { evidence?: string[]; test?: string } = {}) {
            dispatch(alternativeAdded({ labId, hypothesis: id, alternative: { text, evidence: opts.evidence ?? [], test: opts.test, by: agentName, prov: 'heuristic' } }));
          },
        },
        describe() {
          return { id, claim: h.claimText, alternatives: this.alternatives.list(), scope: h.scopeText };
        },
      };
    },
    params: {
      get: (key: string) => paramValue(reg(), key, { params: getState().params.byLab[labId]?.applied ?? {}, signals: {} }),
      set(key: string, value: unknown) {
        const res = dispatch(changeParam(labId, key, value));
        if (!res.ok) throw new Error(`parameter ${key}: ${res.error}`);
        return res.applied ? { applied: true } : { applied: false, pending: res.pending };
      },
    },
    get plan() {
      return { pending: getState().params.byLab[labId]?.pending ?? null, captures: ir().plan.captures };
    },
    start(expId: string, opts: { reason?: string; modes?: string[] } = {}) {
      const captures = ir().plan.captures.filter((c) => c.experiment === expId && (c.status === 'execute' || c.status === 'import') && (!opts.modes || opts.modes.includes(c.mode)));
      if (!captures.length) throw new Error(`nothing to execute for ${expId}${opts.modes ? ` (${opts.modes.join(', ')})` : ''}`);
      // hosts are the lab's own declared hosts; anything else would be a host the program never named
      const hosts = new Set(ir().experiments.map((e) => e.host));
      const bad = captures.find((c) => !hosts.has(c.host));
      if (bad) throw new Error(`${bad.host} is not a host this lab declares`);
      const need = captures.reduce((a, c) => a + c.estimateGpuMin, 0);
      if (need > ASSISTANT.run.budgetGpuMin) throw new Error(`≈ ${need.toFixed(1)} gpu-min exceeds the assistant's budget of ${ASSISTANT.run.budgetGpuMin}`);
      const id = dispatch(proposeJob({ labId, captures, reason: opts.reason ?? `requested by ${agentName}`, by: 'agent', experiment: expId }));
      onJob(id);
      return jobHandle(id);
    },
    checkpoint(label: string) {
      const snap = takeSnapshot(getState, labId);
      return { label, restore: () => restoreSnapshot(dispatch, labId, snap) };
    },
    get jobs() {
      return getState().jobs.list.filter((j) => j.labId === labId);
    },
  };

  const scopeBoard = boardId;
  const boardSummary = () => ir().boards.find((b) => b.id === scopeBoard);
  const paramKey = (name: string) => {
    const r = reg();
    for (const k of [`${scopeBoard}:${name}`, name]) if (r.params.has(k)) return k;
    for (const p of r.params.values()) if (p.slot.urlKey === name) return p.slot.key;
    throw new Error(`board ${scopeBoard} has no parameter ${name}`);
  };
  const self = {
    id: scopeBoard,
    get title() {
      return boardSummary()?.title;
    },
    /** Experiments whose evidence this board shows. */
    get experiments() {
      return boardSummary()?.experiments ?? [];
    },
    runs() {
      return rows(this.experiments.flatMap((e) => reg().source.runs(`${e}/*/*`)).map(runHandle));
    },
    get selected() {
      const ref = getState().selection.sel;
      return ref ? (reg().source.entity(ref) ?? null) : null;
    },
    params: new Proxy(
      {},
      {
        get(_t, name: string) {
          if (name === 'describe')
            return () =>
              Object.fromEntries(
                (boardSummary()?.paramKeys ?? []).flatMap((k) => {
                  const p = reg().params.get(k);
                  return p ? [[p.slot.urlKey, { value: lab.params.get(k), binding: p.summary.binding }]] : [];
                }),
              );
          return lab.params.get(paramKey(name));
        },
        set(_t, name: string, value) {
          lab.params.set(paramKey(name), value);
          return true;
        },
      },
    ),
    state: new Proxy(
      {},
      {
        get(_t, name: string) {
          return rehydrate(reg(), getState().signals.byLab[labId]?.[`${scopeBoard}:${name}`]);
        },
        set(_t, name: string, value) {
          dispatch(setSignal({ labId, key: `${scopeBoard}:${name}`, value: dehydrate(value) }));
          if (isEnt(value)) dispatch(select(value.ref));
          return true;
        },
      },
    ),
    focus(e: Ent) {
      dispatch(select(e.ref));
    },
    find(sel: string) {
      const b = reg().boards.get(scopeBoard);
      const name = sel.replace(/^#/, '');
      return b?.views.find((v) => v.name === name || v.kind === sel) ?? null;
    },
  };
  return { lab, self };
}

async function runAgentCode(dispatch: AppDispatch, getState: GetState, labId: string, boardId: string, code: string, turnId: string): Promise<EvalResult> {
  const t0 = performance.now();
  const logs: string[] = [];
  const snap = takeSnapshot(getState, labId);
  const handles = makeHandles(dispatch, getState, labId, boardId, (jobId) => dispatch(turnUpdated({ labId, id: turnId, patch: { jobId } })));
  const logFn = (...a: unknown[]) => logs.push(a.map((x) => inspect(x)).join(' '));
  const scope: Record<string, unknown> = { ...createLibrary(), ...handles, log: logFn, console: { log: logFn, warn: logFn, error: logFn } };
  const names = Object.keys(scope);
  try {
    // the block lets code declare a name the library also provides (`const q = …`) instead of failing to parse
    const fn = new AsyncFunction(...names, `"use strict";\n{\n${code}\n}`);
    const cancelled = new Promise<never>((_, rej) => cancels.set(turnId, () => rej(new Error('stopped by the user'))));
    const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('the code ran too long and was stopped')), TIMEOUT_MS));
    const value = await Promise.race([fn(...names.map((n) => scope[n])), cancelled, timeout]);
    return { ok: true, value: inspect(value), logs, ms: Math.round(performance.now() - t0) };
  } catch (e) {
    restoreSnapshot(dispatch, labId, snap);
    const err = e as Error;
    return { ok: false, error: `${err?.name ?? 'Error'}: ${err?.message ?? String(e)}`, logs, ms: Math.round(performance.now() - t0), rolledBack: true };
  } finally {
    cancels.delete(turnId);
  }
}

export const stopTurn = (turnId: string) => cancels.get(turnId)?.();

/** Scripted replies available on a board: the preset's replies for that board (or `*`), then the built-ins that apply. */
export function repliesFor(labId: string, boardId: string, ir: IR, pending: boolean): ScriptedReply[] {
  const parsed = parseReplies(presetById(labId)?.replies ?? '');
  const own = [...(parsed.get(boardId) ?? []), ...(parsed.get('*') ?? [])];
  const builtins = BUILTIN_REPLIES.filter((b) => b.applies(ir, boardId, { pending })).map(({ prompt, text, code }) => ({ prompt, text, code }));
  return [...own, ...builtins.filter((b) => !own.some((o) => norm(o.prompt) === norm(b.prompt)))];
}

/** Ask the assistant on a board: a live model when the mode is live, otherwise the scripted reply whose prompt matches. */
export const askAgent = (labId: string, boardId: string, prompt: string) => async (dispatch: AppDispatch, getState: GetState) => {
  if (getState().agent.mode === 'live' && getState().server.health?.assistant.available) return liveTurn(dispatch, getState, labId, boardId, prompt);
  const userId = `t${++turnSeq}`;
  dispatch(turnAdded({ labId, turn: { id: userId, board: boardId, role: 'user', text: prompt, status: 'done', mode: 'scripted' } }));
  const ir = getState().build.byLab[labId]?.ir;
  const replies = ir ? repliesFor(labId, boardId, ir, Boolean(getState().params.byLab[labId]?.pending)) : [];
  const match = replies.find((r) => norm(r.prompt) === norm(prompt));
  const id = `t${++turnSeq}`;
  if (!match) {
    dispatch(
      turnAdded({
        labId,
        turn: {
          id,
          board: boardId,
          role: 'agent',
          mode: 'scripted',
          text: `Scripted mode has no reply for that prompt on this board. ${replies.length ? `Scripted prompts here: ${replies.map((r) => `“${r.prompt}”`).join(', ')}.` : 'There are no scripted prompts for this board.'}${getState().server.health?.assistant.available ? ' Switch to Live to ask the model.' : ' The live model needs the lab server.'}`,
          status: 'done',
        },
      }),
    );
    return;
  }
  dispatch(turnAdded({ labId, turn: { id, board: boardId, role: 'agent', mode: 'scripted', text: match.text, code: match.code.trimEnd(), status: 'running' } }));
  // scripted turns are part of the transcript too; storing them never blocks the turn
  const stored = getState().server.status === 'online'
    ? server.post<{ assistantId: string }>('/assistant/turns', { labId, boardId, mode: 'scripted', prompt, scripted: { text: match.text, code: match.code.trimEnd() } }).catch(() => null)
    : Promise.resolve(null);
  const result = await runAgentCode(dispatch, getState, labId, boardId, match.code, id);
  dispatch(turnUpdated({ labId, id, patch: { status: 'done', result } }));
  const s = await stored;
  if (s) {
    dispatch(turnUpdated({ labId, id, patch: { serverId: s.assistantId } }));
    void server.post(`/assistant/messages/${s.assistantId}/result`, wireResult(result, false)).catch(() => undefined);
  }
};

const wireResult = (r: EvalResult, cont: boolean, context?: Record<string, unknown>) => ({
  status: r.ok ? 'ok' : 'rolled_back',
  value: r.value,
  error: r.error,
  logs: r.logs,
  ms: r.ms,
  continue: cont,
  context,
});

interface LiveReply {
  id: string;
  text: string;
  code: string | null;
  run: boolean;
  step: number;
  model: string;
  usage: TokenUsage | null;
  ms: number;
}

/**
 * A live turn: the server streams the model's reply; its code runs here with the same checkpoint, rollback
 * and approval rules as scripted code; the result goes back as an observation and the model continues,
 * for at most four executions. Every message and model call is stored on the server.
 */
async function liveTurn(dispatch: AppDispatch, getState: GetState, labId: string, boardId: string, prompt: string) {
  dispatch(turnAdded({ labId, turn: { id: `t${++turnSeq}`, board: boardId, role: 'user', text: prompt, status: 'done', mode: 'live' } }));
  let path = '/assistant/turns';
  // the viewer's model choice applies to the whole turn, continuations included
  const model = getState().agent.model ?? undefined;
  let body: unknown = { labId, boardId, mode: 'live', prompt, model, context: boardContext(getState(), labId, boardId) };
  for (let i = 0; i < 6; i++) {
    const id = `t${++turnSeq}`;
    dispatch(turnAdded({ labId, turn: { id, board: boardId, role: 'agent', mode: 'live', text: '', status: 'running', streaming: true } }));
    let reply: LiveReply | null = null;
    let error: string | null = null;
    try {
      await streamPost(path, body, (event, data) => {
        if (event === 'delta') dispatch(turnText({ labId, id, delta: (data as { text: string }).text }));
        else if (event === 'reply') reply = data as LiveReply;
        else if (event === 'error') error = (data as { message: string }).message;
      });
    } catch (e) {
      error = (e as Error).message;
    }
    const r = reply as LiveReply | null;
    if (!r) {
      dispatch(turnUpdated({ labId, id, patch: { status: 'done', streaming: false, error: error ?? 'no reply', text: `The model call failed: ${error ?? 'no reply'}` } }));
      return;
    }
    const runs = Boolean(r.code && r.run);
    dispatch(
      turnUpdated({
        labId,
        id,
        patch: { text: r.text, code: r.code ?? undefined, serverId: r.id, model: r.model, usage: r.usage, step: r.step, streaming: false, skipped: Boolean(r.code && !r.run), status: runs ? 'running' : 'done' },
      }),
    );
    if (!runs) return;
    const result = await runAgentCode(dispatch, getState, labId, boardId, r.code!, id);
    dispatch(turnUpdated({ labId, id, patch: { status: 'done', result } }));
    path = `/assistant/messages/${r.id}/result`;
    body = { ...wireResult(result, true, boardContext(getState(), labId, boardId)), model };
  }
}

interface ServerMessage {
  id: string;
  role: 'user' | 'assistant' | 'observation';
  mode: 'scripted' | 'live';
  content: string;
  code: string | null;
  result: { status: string; value?: string; error?: string; logs?: string[]; ms?: number } | null;
  status: string | null;
  createdAt: string;
  usage: (TokenUsage & { ms?: number }) | null;
}

/** Loads the lab's stored transcript (all boards) once per session. */
export const loadTranscript = (labId: string) => async (dispatch: AppDispatch, getState: GetState) => {
  if (getState().server.status !== 'online' || getState().agent.byLab[labId]?.loaded) return;
  try {
    const convs = await server.get<{ id: string; boardId: string; messages: ServerMessage[] }[]>(`/assistant/conversations?lab=${encodeURIComponent(labId)}`);
    const msgs = convs.flatMap((c) => c.messages.map((m) => ({ ...m, board: c.boardId }))).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const turns: Turn[] = [];
    for (const m of msgs) {
      if (m.role === 'observation') continue;
      const turn: Turn = {
        id: `s-${m.id}`,
        serverId: m.id,
        board: m.board,
        role: m.role === 'user' ? 'user' : 'agent',
        text: m.content,
        code: m.code ?? undefined,
        status: 'done',
        mode: m.mode,
        usage: m.usage,
        skipped: m.status === 'skipped',
      };
      if (m.result) turn.result = { ok: m.result.status === 'ok', value: m.result.value, error: m.result.error, logs: m.result.logs ?? [], ms: m.result.ms ?? 0, rolledBack: m.result.status !== 'ok' };
      turns.push(turn);
    }
    dispatch(transcriptLoaded({ labId, turns }));
  } catch {
    // the transcript stays on the server; this session simply starts without it
  }
};

/**
 * Clear the Agent tab: the lab's active conversations are archived on the server (they stay in the library)
 * and the rail starts empty. Offline, only this session's turns are cleared.
 */
export const clearTranscript = (labId: string) => async (dispatch: AppDispatch, getState: GetState) => {
  if (getState().agent.byLab[labId]?.turns.some((t) => t.status === 'running')) return;
  if (getState().server.status === 'online') {
    try {
      const r = await server.post<{ archived: number }>('/assistant/archive', { labId });
      dispatch(log('info', `transcript cleared: ${r.archived} conversation${r.archived === 1 ? '' : 's'} moved to the library`));
    } catch (e) {
      dispatch(log('error', `could not archive the transcript: ${(e as Error).message}`));
      return;
    }
  }
  dispatch(clearTurns(labId));
};

/** Continue a transcript from the library: it becomes its board's active conversation and reloads. */
export const continueTranscript = (labId: string, conversationId: string) => async (dispatch: AppDispatch) => {
  await server.post(`/assistant/library/${conversationId}/restore`);
  dispatch(transcriptStale(labId));
  dispatch(setView('chat'));
  await dispatch(loadTranscript(labId));
};
