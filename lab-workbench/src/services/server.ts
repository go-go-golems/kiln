/** Minimal JSON client for the lab server (proxied at /api by Vite). */
export class ServerError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown, timeoutMs = 15_000): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctl.signal,
    });
    const text = await res.text();
    const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    if (!res.ok) throw new ServerError(res.status, String(json.error ?? res.status), String(json.message ?? res.statusText));
    return json as T;
  } finally {
    clearTimeout(timer);
  }
}

export const server = {
  get: <T>(path: string, timeoutMs?: number) => request<T>('GET', path, undefined, timeoutMs),
  post: <T>(path: string, body?: unknown, timeoutMs?: number) => request<T>('POST', path, body ?? {}, timeoutMs),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};

/**
 * POSTs and reads a server-sent-event response (EventSource only supports GET). Calls onEvent for every
 * event; resolves when the stream ends. A JSON error response is thrown as ServerError.
 */
export async function streamPost(path: string, body: unknown, onEvent: (event: string, data: unknown) => void, signal?: AbortSignal): Promise<void> {
  const res = await fetch(`/api${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !type.includes('text/event-stream')) {
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new ServerError(res.status, String(json.error ?? res.status), String(json.message ?? res.statusText));
    onEvent('json', json);
    return;
  }
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      let event = 'message';
      const data: string[] = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
      }
      if (data.length) onEvent(event, JSON.parse(data.join('\n')));
    }
  }
}
