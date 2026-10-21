import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hostProfile, jobBody, kernelInput, makeServer, startDriver, type FakeDriver } from './support/server.ts';

/** Read server-sent events from a response until `until` holds; then cancel the stream. */
async function readEvents(res: Response, until: (events: { event: string; data: any }[]) => boolean, ms = 10_000) {
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  const events: { event: string; data: any }[] = [];
  let buf = '';
  const deadline = Date.now() + ms;
  while (!until(events)) {
    if (Date.now() > deadline) throw new Error(`timed out; got ${events.map((e) => e.event).join(', ')}`);
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const field = (k: string) => frame.split('\n').filter((l) => l.startsWith(`${k}:`)).map((l) => l.slice(k.length + 1).trimStart()).join('\n');
      events.push({ event: field('event'), data: JSON.parse(field('data')) });
    }
  }
  await reader.cancel();
  return events;
}

describe('server-sent events (GET /api/events)', () => {
  let d: FakeDriver;
  beforeAll(async () => void (d = await startDriver()));
  afterAll(() => d.stop());

  it('says hello, pings, and reports a job from proposal to records', async () => {
    const s = makeServer({ hosts: [hostProfile('fake', d.url)], config: { pingMs: 50 } });
    const res = await s.call('GET', '/api/events');
    expect(res.headers.get('content-type')).toMatch(/^text\/event-stream/);
    const reading = readEvents(res, (ev) => ev.some((e) => e.event === 'job.updated' && e.data.status === 'done') && ev.some((e) => e.event === 'ping'));
    await new Promise((r) => setTimeout(r, 20));
    expect(s.bus.size).toBe(1);
    const id = (await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody([kernelInput()], { approve: true }) })).body.id;
    const events = await reading;
    expect(events[0]).toEqual({ event: 'hello', data: { version: 'kiln-server/0.1', startedAt: expect.any(String), features: ['records', 'devices', 'hosts', 'jobs', 'archives', 'events', 'lab'] } });
    const kinds = new Set(events.map((e) => e.event));
    for (const k of ['hello', 'ping', 'host.updated', 'job.updated', 'job.event', 'records.added', 'catalog.changed']) expect(kinds.has(k), k).toBe(true);
    expect(events.find((e) => e.event === 'records.added')!.data).toMatchObject({ job: id, ids: [expect.stringMatching(/^[0-9a-f]{64}$/)] });
    expect(events.filter((e) => e.event === 'job.event').map((e) => e.data.kind)).toContain('step.finished');
    await s.jobs.idle();
    await new Promise((r) => setTimeout(r, 20));
    expect(s.bus.size).toBe(0);
  });

  it('reports host probes and forgotten devices', async () => {
    const s = makeServer({ hosts: [hostProfile('fake', d.url)] });
    const id = (await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody([kernelInput()], { approve: true, reps: 1 }) })).body.id;
    await s.jobs.idle();
    const device = (await s.json('GET', `/api/records?job=${id}`)).body.records[0].device.id;
    const reading = readEvents(await s.call('GET', '/api/events'), (ev) => ev.some((e) => e.event === 'host.updated') && ev.some((e) => e.event === 'device.updated'));
    await new Promise((r) => setTimeout(r, 20));
    expect((await s.json('POST', '/api/hosts/fake/probe')).body).toMatchObject({ format: 'kiln-capabilities/1', host: 'fake' });
    await s.json('DELETE', `/api/records?device=${encodeURIComponent(device)}`);
    const got = await reading;
    expect(got.find((e) => e.event === 'host.updated')!.data).toMatchObject({ id: 'fake', reachable: true });
    expect(got.find((e) => e.event === 'device.updated')!.data).toEqual({ id: device, deleted: 1 });
    expect((await s.json('POST', '/api/hosts/nope/probe')).status).toBe(404);
  });
});
