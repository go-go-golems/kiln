// The driver API (guide §13.2, §28.2) from the server's side: plain HTTP to http://<host>:<port>/v1, no
// authentication. Every call has a deadline; a refusal comes back as a DriverError with the driver's status and body.
import type { DriverEvent, Facts, Plan, ProbeRequest } from '@kiln/exec';

export interface DriverInfo {
  api: string;
  sha256: string;
  hostname: string;
  root: string;
  running: string | null;
  queued: string[];
  pid: number;
  python: string;
}

export class DriverError extends Error {
  readonly status: number;
  readonly body: Record<string, unknown> | null;
  constructor(status: number, message: string, body: Record<string, unknown> | null = null) {
    super(message);
    this.status = status;
    this.body = body;
  }
  /** The driver answered with this error code (`missing_blobs`, `not_found`, …) */
  is(code: string): boolean {
    return this.body?.error === code;
  }
}

interface Call {
  method?: string;
  json?: unknown;
  bytes?: Uint8Array;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export class DriverClient {
  readonly url: string;
  constructor(url: string) {
    this.url = url.replace(/\/$/, '');
  }

  private async call(path: string, c: Call = {}): Promise<Response> {
    const signal = AbortSignal.any([AbortSignal.timeout(c.timeoutMs ?? 30_000), ...(c.signal ? [c.signal] : [])]);
    let res: Response;
    try {
      res = await fetch(`${this.url}/v1${path}`, {
        method: c.method ?? 'GET',
        signal,
        ...(c.json !== undefined ? { body: JSON.stringify(c.json), headers: { 'content-type': 'application/json' } } : {}),
        ...(c.bytes ? { body: c.bytes as Uint8Array<ArrayBuffer>, headers: { 'content-type': 'application/octet-stream' } } : {}),
      });
    } catch (e) {
      const err = e as Error;
      const why = err.name === 'TimeoutError' ? `no answer within ${(c.timeoutMs ?? 30_000) / 1000} s` : ((err.cause as Error | undefined)?.message ?? err.message);
      throw new DriverError(0, `the driver at ${this.url} is unreachable: ${why}`);
    }
    if (res.ok) return res;
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    throw new DriverError(res.status, typeof body?.message === 'string' ? body.message : `the driver answered ${res.status} to ${c.method ?? 'GET'} ${path}`, body);
  }

  async info(): Promise<DriverInfo> {
    return (await (await this.call('/info', { timeoutMs: 5_000 })).json()) as DriverInfo;
  }

  /** Probe containers run one per environment, concurrently; the slowest image start bounds the call. */
  async probe(req: ProbeRequest): Promise<Facts> {
    return (await (await this.call('/probe', { method: 'POST', json: req, timeoutMs: 300_000 })).json()) as Facts;
  }

  async hasBlob(sha: string): Promise<boolean> {
    try {
      await this.call(`/blobs/${sha}`, { method: 'HEAD' });
      return true;
    } catch (e) {
      if (e instanceof DriverError && e.status === 404) return false;
      throw e;
    }
  }

  async putBlob(sha: string, bytes: Uint8Array): Promise<void> {
    await this.call(`/blobs/${sha}`, { method: 'PUT', bytes, timeoutMs: 300_000 });
  }

  async submit(plan: Plan): Promise<{ position: number; known?: boolean }> {
    return (await (await this.call('/jobs', { method: 'POST', json: plan })).json()) as { position: number; known?: boolean };
  }

  /** Long poll: events after `after`, waiting at most `waitS` seconds for the first one. */
  async events(job: string, after: number, waitS: number, signal?: AbortSignal): Promise<{ events: DriverEvent[]; state: string }> {
    const res = await this.call(`/jobs/${job}/events?after=${after}&wait=${waitS}`, { timeoutMs: (waitS + 15) * 1000, ...(signal ? { signal } : {}) });
    return (await res.json()) as { events: DriverEvent[]; state: string };
  }

  async cancel(job: string): Promise<void> {
    await this.call(`/jobs/${job}/cancel`, { method: 'POST' });
  }

  async archive(job: string): Promise<Uint8Array> {
    return new Uint8Array(await (await this.call(`/jobs/${job}/archive`, { timeoutMs: 600_000 })).arrayBuffer());
  }

  async remove(job: string): Promise<void> {
    await this.call(`/jobs/${job}`, { method: 'DELETE' });
  }

  async jobs(): Promise<{ id: string; state: string; position: number; events: number }[]> {
    return ((await (await this.call('/jobs')).json()) as { jobs: { id: string; state: string; position: number; events: number }[] }).jobs;
  }

  /** Replaces the driver's own file; the driver re-executes itself and refuses while a job runs. */
  async putSelf(bytes: Uint8Array): Promise<void> {
    await this.call('/self', { method: 'PUT', bytes });
  }
}
