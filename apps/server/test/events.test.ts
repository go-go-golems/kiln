import { describe, expect, it } from 'vitest';
import { jobBody, jobKernel, makeServer } from './support/server.ts';

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
  it('says hello, pings, and reports a job from proposal to records', async () => {
    const s = makeServer({ config: { pingMs: 50 } });
    const res = await s.call('GET', '/api/events');
    expect(res.headers.get('content-type')).toMatch(/^text\/event-stream/);
    const reading = readEvents(res, (ev) => ev.some((e) => e.event === 'job.updated' && e.data.status === 'done') && ev.some((e) => e.event === 'ping'));
    await new Promise((r) => setTimeout(r, 20));
    expect(s.bus.size).toBe(1);
    const id = (await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody([jobKernel()], { approve: true }) })).body.id;
    const events = await reading;
    expect(events[0]).toEqual({ event: 'hello', data: { version: 'kiln-server/0.1', startedAt: expect.any(String), features: ['records', 'devices', 'jobs', 'events'] } });
    const kinds = new Set(events.map((e) => e.event));
    for (const k of ['hello', 'ping', 'job.updated', 'job.event', 'records.added']) expect(kinds.has(k), k).toBe(true);
    expect(events.find((e) => e.event === 'records.added')!.data).toMatchObject({ job: id, ids: [expect.stringMatching(/^[0-9a-f]{64}$/)] });
    expect(events.filter((e) => e.event === 'job.event').map((e) => e.data.kind)).toContain('repetition');
    await s.jobs.idle();
    await new Promise((r) => setTimeout(r, 20));
    expect(s.bus.size).toBe(0);
  });

  it('reports device probes and forgotten devices', async () => {
    const s = makeServer();
    const reading = readEvents(await s.call('GET', '/api/events'), (ev) => ev.filter((e) => e.event === 'device.updated').length >= 2);
    await new Promise((r) => setTimeout(r, 20));
    const probed = await s.json('POST', '/api/devices/fake/probe');
    expect(probed.body).toMatchObject({ class: 'cuda', name: 'CUDA Fake H100', executor: 'fake', available: true, records: 0 });
    await s.json('DELETE', `/api/records?device=${encodeURIComponent(probed.body.id)}`);
    const updates = (await reading).filter((e) => e.event === 'device.updated').map((e) => e.data);
    expect(updates).toEqual([expect.objectContaining({ id: probed.body.id, available: true }), { id: probed.body.id, deleted: 0 }]);
    expect((await s.json('POST', '/api/devices/nope/probe')).status).toBe(404);
  });
});
