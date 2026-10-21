// The page-side client (apps/workbench/src/server-client.js) against the real application.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectServer, sessionToken, subscribe, ServerError } from '../../workbench/src/server-client.js';
import { HOST, hostProfile, jobBody, kernelInput, makeServer as makeBare, startDriver, type FakeDriver } from './support/server.ts';

let d: FakeDriver;
beforeAll(async () => void (d = await startDriver()));
afterAll(() => d.stop());
const makeServer = () => makeBare({ hosts: [hostProfile('fake', d.url)] });

const clientFor = (s: ReturnType<typeof makeServer>, token = s.token) =>
  connectServer({ base: `http://${HOST}`, token, fetch: (url: string, init: RequestInit) => s.app.request(url, { ...init, headers: { ...(init.headers as Record<string, string>), host: HOST } }) });

describe('server-client.js', () => {
  it('finds the token in the served page, and is null without one', () => {
    const doc = (content: string | null) => ({ querySelector: (sel: string) => (sel === 'meta[name="kiln-token"]' && content ? { getAttribute: () => content } : null) });
    expect(sessionToken(doc('abc'))).toBe('abc');
    expect(sessionToken(doc(null))).toBeNull();
    expect(connectServer({ token: null })).toBeNull();
  });

  it('records: add, list, forget', async () => {
    const s = makeServer();
    const c = clientFor(s);
    expect((await c.health()).status).toBe('ok');
    const id = (await c.jobs.create(jobBody([kernelInput()], { approve: true }))).id;
    await s.jobs.idle();
    const recs = await c.records.list({ job: id });
    expect(recs).toHaveLength(1);
    const other = makeServer();
    const oc = clientFor(other);
    expect(await oc.records.add(recs)).toEqual({ added: 1, duplicates: 0, rejected: [] });
    expect(await oc.records.add(recs)).toEqual({ added: 0, duplicates: 1, rejected: [] });
    expect(await oc.records.list({ device: recs[0].device.id })).toEqual(recs);
    expect(await oc.records.forget(recs[0].device.id)).toBe(1);
    expect(await oc.records.list()).toEqual([]);
  });

  it('jobs and hosts: create, dry-run, approve, cancel, probe; refusals arrive as ServerError', async () => {
    const s = makeServer();
    const c = clientFor(s);
    const err = await c.jobs.create(jobBody([kernelInput()], { approve: true }), { proposer: 'agent' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ServerError);
    expect([err.status, err.code]).toEqual([403, 'agent_cannot_approve']);
    const proposed = await c.jobs.create(jobBody([kernelInput()]), { proposer: 'agent' });
    expect(proposed.status).toBe('proposed');
    expect((await c.jobs.list()).map((j: { id: string }) => j.id)).toEqual([proposed.id]);
    await c.jobs.approve(proposed.id);
    await s.jobs.idle();
    expect((await c.jobs.get(proposed.id)).status).toBe('done');
    const second = await c.jobs.create(jobBody([kernelInput()]));
    expect((await c.jobs.cancel(second.id)).status).toBe('cancelled');
    expect(await c.jobs.create({ ...jobBody([kernelInput({ extra: ' // dry' })]), dryRun: true })).toMatchObject({ dryRun: true, steps: 3, verdicts: [{ verdict: 'execute' }] });
    expect((await c.jobs.plan(proposed.id)).format).toBe('kiln-plan/1');
    expect((await c.hosts.probe('fake')).offers.kinds['kiln-kernels/1']).toEqual({ environment: 'kiln-perf' });
    expect((await c.hosts.list())[0]).toMatchObject({ id: 'fake', reachable: true });
    expect((await c.devices.list())[0]).toMatchObject({ host: 'fake', records: 1 });
    expect((await c.archives.list())[0]).toMatchObject({ job: proposed.id });
    const bad = await clientFor(s, '0'.repeat(64)).records.add([]).catch((e: unknown) => e);
    expect([bad.status, bad.code]).toEqual([403, 'bad_token']);
  });

  it('subscribe: dispatches events, reconnects with a doubling delay when the stream is refused, and stops', async () => {
    const opened: FakeES[] = [];
    class FakeES {
      readyState = 0;
      onopen: (() => void) | null = null;
      onerror: (() => void) | null = null;
      listeners = new Map<string, (e: { data: string }) => void>();
      closed = false;
      url: string;
      constructor(url: string) {
        this.url = url;
        opened.push(this);
      }
      addEventListener(t: string, f: (e: { data: string }) => void) { this.listeners.set(t, f); }
      close() { this.closed = true; this.readyState = 2; }
      emit(t: string, data: unknown) { this.listeners.get(t)?.({ data: JSON.stringify(data) }); }
    }
    const got: unknown[] = [];
    const stop = subscribe('/api/events', { 'job.updated': (d: unknown) => got.push(['job', d]), any: (t: string) => got.push(t), error: () => got.push('error') }, { EventSource: FakeES, minDelay: 10, maxDelay: 25 });
    expect(opened.map((e) => e.url)).toEqual(['/api/events']);
    opened[0]!.onopen!();
    opened[0]!.emit('job.updated', { id: 'j', status: 'done' });
    opened[0]!.emit('hello', {});
    expect(got).toEqual([['job', { id: 'j', status: 'done' }], 'job.updated', 'hello']);
    // EventSource retrying by itself (CONNECTING): nothing to do
    opened[0]!.onerror!();
    expect(opened).toHaveLength(1);
    // EventSource gave up (CLOSED): reconnect after 10 ms, then 20, then 25 (the cap)
    const giveUp = async (n: number) => {
      opened.at(-1)!.readyState = 2;
      opened.at(-1)!.onerror!();
      await new Promise((r) => setTimeout(r, 40));
      expect(opened).toHaveLength(n);
    };
    await giveUp(2);
    await giveUp(3);
    stop();
    expect(opened.at(-1)!.closed).toBe(true);
    opened.at(-1)!.readyState = 2;
    opened.at(-1)!.onerror!();
    await new Promise((r) => setTimeout(r, 40));
    expect(opened).toHaveLength(3);
  });
});
