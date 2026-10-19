import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Api, AssistantMessage, Context, Model, Usage } from '@earendil-works/pi-ai';

/**
 * Model access through the user's pi agent: credentials come from ~/.pi/agent/auth.json via pi's
 * ModelRuntime (which refreshes OAuth tokens); providers registered by extensions (lunaroute) are loaded
 * from exactly the extension files named here, never the user's whole pi configuration. No credential is
 * read, logged or returned by this module.
 */

export const THINKING = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export type Thinking = (typeof THINKING)[number];

export interface ModelSpec {
  provider: string;
  id: string;
  thinking: Thinking;
}

/** What the browser may choose from: models pi has credentials for, with their thinking levels. */
export interface ModelInfo {
  /** provider/id */
  spec: string;
  provider: string;
  id: string;
  name: string;
  reasoning: boolean;
  thinking: Thinking[];
  contextWindow: number | null;
}

export interface CompletionResult {
  /** characters sent (system prompt + messages); the basis of a local token estimate */
  promptChars: number;
  text: string;
  usage: Usage | null;
  stopReason: string;
  error: string | null;
  durationMs: number;
}

export interface ModelHandle {
  spec: ModelSpec;
  label: string;
  complete(context: Context, opts: { signal?: AbortSignal; onDelta?: (text: string) => void }): Promise<CompletionResult>;
  assistantMessage(text: string): AssistantMessage;
}

export interface ModelCatalog {
  list(): ModelInfo[];
  handle(spec: ModelSpec): { ok: true; model: ModelHandle } | { ok: false; reason: string };
}

export function parseModelSpec(s: string): ModelSpec {
  const m = /^([^/\s]+)\/([^:\s]+)(?::(off|minimal|low|medium|high|xhigh|max))?$/.exec(s.trim());
  if (!m) throw new Error(`model must look like provider/id[:thinking], got "${s}"`);
  return { provider: m[1], id: m[2], thinking: (m[3] as Thinking) ?? 'medium' };
}

export const specLabel = (s: ModelSpec) => `${s.provider}/${s.id}:${s.thinking}`;

/** Extension files that register providers; lunaroute's is found in pi's npm directory unless overridden. */
export function extensionPaths(env = process.env): string[] {
  if (env.PERF_LAB_PI_EXTENSIONS) return env.PERF_LAB_PI_EXTENSIONS.split(',').map((s) => s.trim()).filter(Boolean);
  const lunaroute = join(homedir(), '.pi/agent/npm/node_modules/@lunaroute/pi-extension/src/index.ts');
  return existsSync(lunaroute) ? [lunaroute] : [];
}

/**
 * Providers whose gateway drops pi-ai's `developer` role (measured for lunaroute on 2026-10-12: the model
 * never saw the system prompt); for them the system prompt goes in the `system` role.
 */
const systemRoleProviders = (env = process.env) => new Set((env.PERF_LAB_SYSTEM_ROLE_PROVIDERS ?? 'lunaroute').split(',').map((s) => s.trim()));

/**
 * Thinking levels a model accepts. pi's `thinkingLevelMap` holds overrides: `null` marks a level the model
 * does not support; the standard levels are otherwise supported, the extended ones (xhigh, max) only when mapped.
 */
export function thinkingLevels(m: Pick<Model<Api>, 'reasoning'>): Thinking[] {
  if (!m.reasoning) return ['off'];
  const map = (m as unknown as { thinkingLevelMap?: Record<string, string | null> }).thinkingLevelMap ?? {};
  const standard: Thinking[] = ['off', 'minimal', 'low', 'medium', 'high'];
  return THINKING.filter((t) => (standard.includes(t) ? map[t] !== null : t in map && map[t] !== null));
}

const emptyUsage = (): Usage => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } });

/** One pi runtime for the server's lifetime; any authorized model is resolved per request. */
export async function createPiCatalog(): Promise<{ ok: true; catalog: ModelCatalog } | { ok: false; reason: string }> {
  try {
    const pi = await import('@earendil-works/pi-coding-agent');
    const modelRuntime = await pi.ModelRuntime.create({ refreshOnCreate: false });
    const resourceLoader = new pi.DefaultResourceLoader({
      cwd: process.cwd(),
      agentDir: pi.getAgentDir(),
      noExtensions: true,
      additionalExtensionPaths: extensionPaths(),
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
    });
    await resourceLoader.reload();
    // the session only binds extension-registered providers to modelRuntime; prompts never go through it,
    // so pi's coding tools are never offered to the model
    const { session } = await pi.createAgentSession({
      resourceLoader,
      modelRuntime,
      noTools: 'all',
      sessionManager: pi.SessionManager.inMemory(),
      settingsManager: pi.SettingsManager.inMemory(),
    });
    process.once('exit', () => session.dispose());
    // background variants are for asynchronous (deferred) requests, which a streamed turn does not use
    const available = (await modelRuntime.getAvailable()).filter((m) => !m.id.endsWith('-background') && (m.input ?? ['text']).includes('text'));
    const systemRole = systemRoleProviders();
    const handles = new Map<string, ModelHandle>();

    const makeHandle = (spec: ModelSpec, registered: Model<Api>): ModelHandle => {
      const model = systemRole.has(spec.provider) ? ({ ...registered, compat: { ...(registered.compat ?? {}), supportsDeveloperRole: false } } as Model<Api>) : registered;
      return {
        spec,
        label: specLabel(spec),
        async complete(context, opts) {
          const t0 = Date.now();
          const promptChars =
            (context.systemPrompt?.length ?? 0) +
            context.messages.reduce((a, msg) => a + (typeof msg.content === 'string' ? msg.content.length : JSON.stringify(msg.content).length), 0);
          const stream = modelRuntime.streamSimple(model, context, { reasoning: spec.thinking === 'off' ? undefined : spec.thinking, signal: opts.signal });
          let text = '';
          try {
            for await (const ev of stream) {
              if (ev.type === 'text_delta') {
                text += ev.delta;
                opts.onDelta?.(ev.delta);
              }
            }
            const msg = await stream.result();
            const final = msg.content.filter((c) => c.type === 'text').map((c) => (c as { text: string }).text).join('');
            return {
              promptChars,
              text: final || text,
              usage: msg.usage ?? null,
              stopReason: msg.stopReason,
              error: msg.errorMessage ?? (msg.stopReason === 'error' || msg.stopReason === 'aborted' ? msg.stopReason : null),
              durationMs: Date.now() - t0,
            };
          } catch (e) {
            return { promptChars, text, usage: null, stopReason: 'error', error: (e as Error).message, durationMs: Date.now() - t0 };
          }
        },
        assistantMessage(text) {
          return { role: 'assistant', content: [{ type: 'text', text }], api: model.api, provider: model.provider, model: model.id, usage: emptyUsage(), stopReason: 'stop', timestamp: Date.now() } as AssistantMessage;
        },
      };
    };

    const catalog: ModelCatalog = {
      list: () =>
        available.map((m) => ({
          spec: `${m.provider}/${m.id}`,
          provider: m.provider,
          id: m.id,
          name: m.name ?? m.id,
          reasoning: Boolean(m.reasoning),
          thinking: thinkingLevels(m),
          contextWindow: m.contextWindow ?? null,
        })),
      handle(spec) {
        const label = specLabel(spec);
        const cached = handles.get(label);
        if (cached) return { ok: true, model: cached };
        const registered = available.find((m) => m.provider === spec.provider && m.id === spec.id);
        if (!registered) return { ok: false, reason: `pi has no authorized model ${spec.provider}/${spec.id}` };
        const levels = thinkingLevels(registered);
        if (!levels.includes(spec.thinking)) return { ok: false, reason: `${spec.provider}/${spec.id} supports thinking ${levels.join(', ')}, not ${spec.thinking}` };
        const h = makeHandle(spec, registered);
        handles.set(label, h);
        return { ok: true, model: h };
      },
    };
    return { ok: true, catalog };
  } catch (e) {
    return { ok: false, reason: `pi model runtime failed: ${(e as Error).message.slice(0, 300)}` };
  }
}
