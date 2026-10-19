import { join } from 'node:path';
import { deviceId, repetitionOrder, validateRecord, type MeasurementRecord } from '@kiln/evidence';
import { describe, expect, it } from 'vitest';
import { cudaIdentity } from '../src/devices.ts';
import type { ServerEvent } from '../src/events.ts';
import { fakeExecutor, jobBody, jobKernel, makeServer, tempDir } from './support/server.ts';

const statuses = (events: ServerEvent[], id: string) => events.filter((e) => e.type === 'job.updated' && (e.data as { id: string }).id === id).map((e) => (e.data as { status: string }).status).filter((s, i, a) => s !== a[i - 1]);
const listen = (s: ReturnType<typeof makeServer>) => {
  const events: ServerEvent[] = [];
  s.bus.on((e) => events.push(e));
  return events;
};

describe('job creation (guide §30.4)', () => {
  it('recomputes every content id and refuses a mismatch', async () => {
    const s = makeServer();
    const k = jobKernel();
    const forged = { ...jobKernel({ name: 'k_b', seed: 12 }), contentId: k.contentId };
    const r = await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody([k, forged]) });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ error: 'content_id_mismatch', kernel: 1, name: 'k_b', got: k.contentId });
    // changing the source, the launch, an input seed or the output shape changes the content id
    for (const edit of [(x: any) => (x.source += '// changed\n'), (x: any) => (x.launch.grid += 1), (x: any) => (x.inputs[0].seed += 1), (x: any) => (x.output = [x.output[0] + 1])]) {
      const x = structuredClone(k);
      edit(x);
      expect((await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody([x]) })).body.error).toBe('content_id_mismatch');
    }
    expect((await s.json('GET', '/api/jobs')).body.jobs).toEqual([]);
  });

  it('names content by code, not by kernel name: the entry symbol is canonicalised', async () => {
    const s = makeServer();
    const a = jobKernel({ name: 'k_first' }), b = jobKernel({ name: 'k_second' });
    expect(a.contentId).toBe(b.contentId);
    expect((await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody([a, b]) })).status).toBe(201);
    expect((await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody([{ ...a, symbol: 'k_other' }]) })).body.message).toMatch(/__global__ function is k_first/);
  });

  it('needs a proposer, and an agent can never create an approved job', async () => {
    const s = makeServer();
    expect((await s.json('POST', '/api/jobs', { body: jobBody([jobKernel()]) })).body.error).toBe('bad_proposer');
    expect((await s.json('POST', '/api/jobs', { proposer: 'agent', body: jobBody([jobKernel()], { approve: true }) })).body.error).toBe('agent_cannot_approve');
    expect((await s.json('GET', '/api/jobs')).body.jobs).toEqual([]);
    const r = await s.json('POST', '/api/jobs', { proposer: 'agent', body: jobBody([jobKernel()]) });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ status: 'proposed', proposedBy: 'agent', approvedAt: null });
  });

  it('enforces the limits: 64 kernels, 64 repetitions, a known executor, sane kernels', async () => {
    const s = makeServer();
    const k = jobKernel();
    expect((await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody(Array.from({ length: 65 }, () => k)) })).body.error).toBe('limit_exceeded');
    expect((await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody([k], { reps: 65 }) })).body.error).toBe('limit_exceeded');
    expect((await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody([k], { executor: 'gpu-farm' }) })).body.error).toBe('unknown_executor');
    expect((await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody([{ ...k, samples: [0, 16] , expect: [0, 0] }]) })).body.message).toMatch(/samples must be/);
    expect((await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody([{ ...k, expect: k.expect.slice(1) }]) })).body.message).toMatch(/expect must hold/);
    expect((await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody([{ ...k, source: 'int main() {}' }]) })).body.message).toMatch(/no __global__ function/);
    expect((await s.json('POST', '/api/jobs', { proposer: 'user', body: { ...jobBody([k]), reason: '' } })).body.message).toMatch(/reason/);
  });

  it('refuses agent jobs once the daily budget is spent', async () => {
    const s = makeServer({ config: { agentBudgetSec: 0 } });
    const r = await s.json('POST', '/api/jobs', { proposer: 'agent', body: jobBody([jobKernel()]) });
    expect([r.status, r.body.error]).toEqual([429, 'agent_budget_exhausted']);
    expect((await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody([jobKernel()]) })).status).toBe(201);
  });
});

describe('the job lifecycle with the fake runner', () => {
  it('proposed → approved → running → done, one record per kernel, valid, on the reported device', async () => {
    const s = makeServer();
    const events = listen(s);
    const ks = [jobKernel({ name: 'k_a', row: 'MAP=row' }), jobKernel({ name: 'k_b', row: 'MAP=thread' }), jobKernel({ name: 'k_c', row: 'MAP=tiled' })];
    const created = await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody(ks, { reps: 4, seed: 9 }) });
    expect(created.body.status).toBe('proposed');
    const id = created.body.id as string;
    expect(s.jobs.view(id)!.status).toBe('proposed');
    const approved = await s.json('POST', `/api/jobs/${id}/approve`);
    expect(approved.body.status).toMatch(/approved|running/);
    await s.jobs.idle();
    const job = (await s.json('GET', `/api/jobs/${id}`)).body;
    expect(job).toMatchObject({ status: 'done', error: null, proposedBy: 'user', protocol: { reps: 4, warmup: 1, launches: 5, seed: 9 } });
    expect(job.executorSeconds).toBeGreaterThan(0);
    expect(statuses(events, id)).toEqual(['proposed', 'approved', 'running', 'done']);
    expect(job.events.map((e: { kind: string }) => e.kind).filter((k: string) => k !== 'runner')).toEqual(['proposed', 'approved', 'running', 'repetition', 'repetition', 'repetition', 'repetition', 'done']);
    expect(job.events.some((e: { kind: string; detail: string }) => e.kind === 'runner' && /k_b\s+\d/.test(e.detail))).toBe(true);

    const records = (await s.json('GET', `/api/records?job=${id}`)).body.records as MeasurementRecord[];
    expect(records.map((r) => r.kernel.name).sort()).toEqual(['k_a', 'k_b', 'k_c']);
    expect(job.records.sort()).toEqual(records.map((r) => r.id).sort());
    const dev = cudaIdentity({ name: 'Fake H100', cc: '9.0', sms: 132, driver: 12080, driverVersion: '580.00-fake', persistenceMode: 'Enabled', maxSmClockMHz: 1980, maxMemClockMHz: 2619 }, s.devices.executors.get('fake')!.host);
    for (const r of records) {
      const k = ks.find((x) => x.name === r.kernel.name)!;
      expect(validateRecord(r).ok).toBe(true);
      expect(r).toMatchObject({ by: 'job', device: { id: dev.id, class: 'cuda', name: 'CUDA Fake H100' }, kernel: { contentId: k.contentId, lang: 'cuda', row: k.row }, timing: { kind: 'cuda-events', launches: 5, warmup: 1 }, validity: { ok: true }, protocol: { reps: 4, seed: 9, pairId: id }, manifest: { codegen: 'kiln-codegen/1', app: 'kiln-server/0.1', runner: 'fake_runner/1' } });
      expect(r.timing.samples).toHaveLength(4);
      expect(r.timing.raw!.every((rep) => rep.length === 5)).toBe(true);
      expect(r.check).toEqual({ ok: true, sampled: 16, maxAbsErr: 0, detail: 'max abs diff 0.00e+0' });
      expect(r.activation.notes).toEqual(['activation not checked: the job spec carried none']);
      // the kernel's place in each repetition is the seeded shuffle's
      const i = ks.indexOf(k);
      expect(r.protocol.position).toEqual([0, 1, 2, 3].map((rep) => repetitionOrder(3, 9, rep).indexOf(i)));
    }
    expect(dev.id).toBe(deviceId('cuda', 'Fake H100', dev.fingerprint));
    expect(events.find((e) => e.type === 'records.added')?.data).toEqual({ job: id, device: dev.id, ids: expect.any(Array) });
    const devices = (await s.json('GET', '/api/devices')).body.devices;
    expect(devices).toEqual([expect.objectContaining({ id: dev.id, executor: 'fake', available: true, records: 3 })]);
  });

  it('a user job created with approve: true runs at once', async () => {
    const s = makeServer();
    const r = await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody([jobKernel()], { approve: true }) });
    expect(r.body.approvedAt).not.toBeNull();
    await s.jobs.idle();
    expect(s.jobs.view(r.body.id)!.status).toBe('done');
  });

  it('runs one job at a time, in approval order', async () => {
    const s = makeServer({ executors: [fakeExecutor({ KILN_FAKE_DELAY_MS: '60' })] });
    const events = listen(s);
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) ids.push((await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody([jobKernel()], { reps: 2, approve: true }) })).body.id);
    await s.jobs.idle();
    const order = events.filter((e) => e.type === 'job.updated' && ['running', 'done'].includes((e.data as { status: string }).status)).map((e) => `${(e.data as { status: string }).status}:${ids.indexOf((e.data as { id: string }).id)}`).filter((x, i, a) => x !== a[i - 1]);
    expect(order).toEqual(['running:0', 'done:0', 'running:1', 'done:1', 'running:2', 'done:2']);
  });

  it('an output that differs from the page reference makes the record invalid, with the reason', async () => {
    const s = makeServer();
    const k = jobKernel({ expect: Array.from({ length: 16 }, (_, i) => (i === 3 ? 0.5 : i === 5 ? null : Math.fround(Math.sin(i)))) });
    const id = (await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody([k], { approve: true }) })).body.id;
    await s.jobs.idle();
    const [r] = (await s.json('GET', `/api/records?job=${id}`)).body.records as MeasurementRecord[];
    expect(s.jobs.view(id)!.status).toBe('done');
    expect(r!.validity.ok).toBe(false);
    expect(r!.validity.reasons[0]).toMatch(/^output check: 1 of 15 values differ \(first at 3: 0\.14\d* vs 0\.5\).*\(1 samples skipped: the reference is NaN there\)$/);
    expect(r!.check.ok).toBe(false);
  });

  it('a kernel the runner fails on gets an invalid record; the others stay valid', async () => {
    const s = makeServer({ executors: [fakeExecutor({ KILN_FAKE_FAIL: 'k_bad' })] });
    const id = (await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody([jobKernel({ name: 'k_ok' }), jobKernel({ name: 'k_bad', extra: ' // bad' })], { approve: true }) })).body.id;
    await s.jobs.idle();
    const records = (await s.json('GET', `/api/records?job=${id}`)).body.records as MeasurementRecord[];
    const bad = records.find((r) => r.kernel.name === 'k_bad')!, ok = records.find((r) => r.kernel.name === 'k_ok')!;
    expect(s.jobs.view(id)!.status).toBe('done');
    expect(ok.validity.ok).toBe(true);
    expect(bad.timing.samples).toEqual([]);
    expect(bad.validity.reasons).toEqual(['repetition error: repetition 0: fake failure', 'repetition error: repetition 1: fake failure', 'repetition error: repetition 2: fake failure', 'small n: 0 of 3 repetitions completed']);
  });

  it('cancels a proposed job, and refuses to cancel or approve a finished one', async () => {
    const s = makeServer();
    const id = (await s.json('POST', '/api/jobs', { proposer: 'agent', body: jobBody([jobKernel()]) })).body.id;
    expect((await s.json('POST', `/api/jobs/${id}/cancel`)).body.status).toBe('cancelled');
    expect((await s.json('POST', `/api/jobs/${id}/approve`)).body.error).toBe('bad_state');
    expect((await s.json('POST', `/api/jobs/${id}/cancel`)).body.error).toBe('bad_state');
    expect((await s.json('POST', '/api/jobs/job-nope/approve')).status).toBe(404);
    expect((await s.json('GET', '/api/jobs/job-nope')).status).toBe(404);
  });

  it('cancels a running job: the runner is killed, completed repetitions are kept as invalid records', async () => {
    const counter = join(tempDir(), 'n');
    const s = makeServer({ executors: [fakeExecutor({ KILN_FAKE_COUNTER: counter, KILN_FAKE_DELAY_MS: '30000', KILN_FAKE_DELAY_FROM: '3' })] });
    const events = listen(s);
    const id = (await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody([jobKernel()], { reps: 5, approve: true }) })).body.id;
    await waitFor(() => events.some((e) => e.type === 'job.event' && (e.data as { detail: string }).detail.startsWith('repetition 2 of 5')));
    const t0 = Date.now();
    const r = await s.json('POST', `/api/jobs/${id}/cancel`);
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(r.body.status).toBe('cancelled');
    const [rec] = (await s.json('GET', `/api/records?job=${id}`)).body.records as MeasurementRecord[];
    expect(rec!.timing.samples).toHaveLength(2);
    expect(rec!.validity.reasons).toEqual(['small n: 2 of 5 repetitions completed', 'job cancelled after 2 of 5 repetitions']);
  });

  it('fails a repetition that exceeds the per-repetition timeout, keeping partial records', async () => {
    const counter = join(tempDir(), 'n');
    const s = makeServer({ executors: [fakeExecutor({ KILN_FAKE_COUNTER: counter, KILN_FAKE_DELAY_MS: '30000', KILN_FAKE_DELAY_FROM: '2' })], config: { repTimeoutMs: 400 } });
    const id = (await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody([jobKernel()], { reps: 3, approve: true }) })).body.id;
    const t0 = Date.now();
    await s.jobs.idle();
    expect(Date.now() - t0).toBeLessThan(5000);
    const job = s.jobs.view(id)!;
    expect(job.status).toBe('failed');
    expect(job.error).toBe('repetition 2 of 3 timed out after 0.4 s');
    const [rec] = (await s.json('GET', `/api/records?job=${id}`)).body.records as MeasurementRecord[];
    expect(rec!.timing.samples).toHaveLength(1);
    expect(rec!.validity.reasons).toEqual(['small n: 1 of 3 repetitions completed', 'job failed: repetition 2 of 3 timed out after 0.4 s']);
  });

  it('fails a job whose runner exits with an error, with the runner\'s message', async () => {
    const s = makeServer({ executors: [fakeExecutor({ KILN_FAKE_COUNTER: join(tempDir(), 'n'), KILN_FAKE_EXIT_AT: '1' })] });
    const id = (await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody([jobKernel()], { approve: true }) })).body.id;
    await s.jobs.idle();
    const job = s.jobs.view(id)!;
    expect(job.status).toBe('failed');
    expect(job.error).toMatch(/^repetition 1 of 3: .* exited with 3: fake runner: invocation 1 fails$/);
    expect(job.records).toEqual([]);
  });

  it('stops an agent job when the daily budget runs out', async () => {
    const s = makeServer({ executors: [fakeExecutor({ KILN_FAKE_DELAY_MS: '300' })], config: { agentBudgetSec: 0.5 } });
    const id = (await s.json('POST', '/api/jobs', { proposer: 'agent', body: jobBody([jobKernel()], { reps: 10 }) })).body.id;
    await s.json('POST', `/api/jobs/${id}/approve`);
    await s.jobs.idle();
    const job = s.jobs.view(id)!;
    expect(job.status).toBe('failed');
    expect(job.error).toMatch(/^(repetition \d+ of 10 stopped: )?the agents' budget of 0\.5 executor seconds per 24 hours is spent$/);
    expect(job.executorSeconds).toBeLessThan(1.5);
    expect((await s.json('POST', '/api/jobs', { proposer: 'agent', body: jobBody([jobKernel()]) })).body.error).toBe('agent_budget_exhausted');
  });

  it('fails jobs left running by a previous process', () => {
    const s = makeServer();
    s.db.prepare(`insert into jobs (id, status, proposed_by, executor, reason, spec_json, spec_sha256, created_at) values ('j', 'running', 'user', 'fake', 'r', '{"codegen":"x","protocol":{},"kernels":[]}', 'x', '2026-10-19T00:00:00Z')`).run();
    expect(s.jobs.failInterrupted()).toBe(1);
    expect(s.jobs.view('j')).toMatchObject({ status: 'failed', error: 'interrupted: the server stopped while the job was running' });
  });
});

async function waitFor(pred: () => boolean, ms = 10_000): Promise<void> {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > ms) throw new Error('waitFor: timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
}
