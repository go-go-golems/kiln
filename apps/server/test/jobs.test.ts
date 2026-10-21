// The one job API end to end (KILN-003 guide §24): the server plans, a real kiln_driver.py runs the plan through the
// fake docker, and the server imports the archive into runs and kiln-measure/1 records.
import { join } from 'node:path';
import { cudaDevice, repetitionOrder, validateRecord, type MeasurementRecord } from '@kiln/evidence';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ServerEvent } from '../src/events.ts';
import { hostProfile, jobBody, kernelInput, makeServer, staleDriverCopy, startDriver, tempDir, waitFor, type FakeDriver } from './support/server.ts';

const FAKE_DEVICE = { name: 'Fake H100', cc: '9.0', sms: 132, driver: 12080, driverVersion: '580.00-fake', persistenceMode: 'Enabled', maxSmClockMHz: 1980, maxMemClockMHz: 2619 };
const IMAGE = `sha256:${'a'.repeat(64)}`;
const NO_NCU = 'kiln-perf has no ncu: build the image with it or add a tool mount';

const statuses = (events: ServerEvent[], id: string) => events.filter((e) => e.type === 'job.updated' && (e.data as { id: string }).id === id).map((e) => (e.data as { status: string }).status).filter((s, i, a) => s !== a[i - 1]);
const listen = (s: ReturnType<typeof makeServer>) => {
  const events: ServerEvent[] = [];
  s.bus.on((e) => events.push(e));
  return events;
};
const jobEvents = (events: ServerEvent[], kind: string) => events.filter((e) => e.type === 'job.event' && (e.data as { kind: string }).kind === kind);

describe('hosts and plans', () => {
  let d: FakeDriver;
  beforeAll(async () => void (d = await startDriver()));
  afterAll(() => d.stop());

  it('probes the driver and derives the capability document', async () => {
    const s = makeServer({ hosts: [hostProfile('fake', d.url)] });
    const caps = (await s.json('GET', '/api/hosts/fake/capabilities')).body;
    expect(caps).toMatchObject({
      format: 'kiln-capabilities/1', host: 'fake',
      facts: { gpus: [{ uuid: 'GPU-fake-0000-0000', name: 'Fake H100' }], environments: { 'kiln-perf': { image: IMAGE } } },
      offers: { kinds: { 'kiln-kernels/1': { environment: 'kiln-perf' } }, collectors: { 'cuda-events': { kinds: ['kiln-kernels/1'] }, 'gpu-sampler': { kinds: ['kiln-kernels/1'] } } },
    });
    expect(caps.offers.collectors.ncu).toEqual({ blocked: NO_NCU });
    const hosts = (await s.json('GET', '/api/hosts')).body.hosts;
    expect(hosts).toEqual([expect.objectContaining({ id: 'fake', reachable: true, driver: expect.objectContaining({ current: true, hostname: 'fakehost', running: null }) })]);
  });

  it('an unreachable host answers 503, and a job on it is refused before anything is stored', async () => {
    const s = makeServer({ hosts: [hostProfile('gone', 'http://127.0.0.1:9')] });
    expect((await s.json('GET', '/api/hosts/gone/capabilities')).status).toBe(503);
    const r = await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody([kernelInput()], { host: 'gone' }) });
    expect([r.status, r.body.error]).toEqual([503, 'host_unreachable']);
    expect((await s.json('GET', '/api/jobs')).body.jobs).toEqual([]);
    expect((await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody([kernelInput()], { host: 'nowhere' }) })).body.error).toBe('unknown_host');
  });

  it('replaces an out-of-date driver before probing it (PUT /v1/self)', async () => {
    const old = await startDriver({ driverFile: staleDriverCopy() });
    try {
      const s = makeServer({ hosts: [hostProfile('fake', old.url)] });
      const events = listen(s);
      expect((await s.json('POST', '/api/hosts/fake/probe')).status).toBe(200);
      expect(events.some((e) => e.type === 'host.updated' && (e.data as { driverUpdated?: string }).driverUpdated)).toBe(true);
      expect((await s.json('GET', '/api/hosts')).body.hosts[0].driver.current).toBe(true);
    } finally {
      await old.stop();
    }
  });

  it('dryRun: the verdicts and the plan, nothing stored; a counters capture is blocked with the reason', async () => {
    const s = makeServer({ hosts: [hostProfile('fake', d.url)] });
    const body = { ...jobBody([kernelInput({ name: 'k_a' }), kernelInput({ name: 'k_b', seed: 12 })], { reps: 2 }), dryRun: true };
    body.captures.push({ kind: 'kiln-kernels/1', mode: 'counters', input: kernelInput({ name: 'k_a' }), rerun: true });
    const r = await s.json('POST', '/api/jobs', { proposer: 'user', body });
    expect(r.status).toBe(200);
    expect(r.body.verdicts.map((v: { verdict: string }) => v.verdict)).toEqual(['execute', 'execute', 'blocked']);
    expect(r.body.verdicts[2].reason).toBe(NO_NCU);
    expect(r.body).toMatchObject({ dryRun: true, groups: 1, steps: 2, environments: ['kiln-perf'], plan: { format: 'kiln-plan/1', gpu: { uuid: 'GPU-fake-0000-0000' } } });
    expect(r.body.plan.steps[0]).toMatchObject({ environment: 'kiln-perf', argv: ['python3', '/job/in/runner/kiln_runner.py', 'run', '/job/in/bundles/g0-r0.json', '--out', '/job/out/results.json'], sidecars: ['gpu-sampler'] });
    expect((await s.json('GET', '/api/jobs')).body.jobs).toEqual([]);
  });

  it('recomputes every content id and refuses a mismatch', async () => {
    const s = makeServer({ hosts: [hostProfile('fake', d.url)] });
    const k = kernelInput();
    const forged = { ...kernelInput({ name: 'k_b', seed: 12 }), contentId: k.contentId };
    const r = await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody([k, forged]) });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ error: 'content_id_mismatch', capture: 1, name: 'k_b', got: k.contentId });
    // changing the source, the launch, an input seed or the output shape changes the content id
    for (const edit of [(x: any) => (x.source += '// changed\n'), (x: any) => (x.launch.grid += 1), (x: any) => (x.inputs[0].seed += 1), (x: any) => (x.output = [x.output[0] + 1])]) {
      const x = structuredClone(k);
      edit(x);
      expect((await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody([x]) })).body.error).toBe('content_id_mismatch');
    }
    expect((await s.json('GET', '/api/jobs')).body.jobs).toEqual([]);
  });

  it('names content by code, not by kernel name: the entry symbol is canonicalised', async () => {
    const s = makeServer({ hosts: [hostProfile('fake', d.url)] });
    const a = kernelInput({ name: 'k_first' }), b = kernelInput({ name: 'k_second' });
    expect(a.contentId).toBe(b.contentId);
    expect((await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody([a]) })).status).toBe(201);
    expect((await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody([{ ...a, symbol: 'k_other' }]) })).body.message).toMatch(/__global__ function is k_first/);
  });

  it('needs a proposer; an agent never creates an approved job; budgets and limits hold', async () => {
    const s = makeServer({ hosts: [hostProfile('fake', d.url)] });
    const k = kernelInput();
    expect((await s.json('POST', '/api/jobs', { body: jobBody([k]) })).body.error).toBe('bad_proposer');
    expect((await s.json('POST', '/api/jobs', { proposer: 'agent', body: jobBody([k], { approve: true }) })).body.error).toBe('agent_cannot_approve');
    const r = await s.json('POST', '/api/jobs', { proposer: 'agent', body: jobBody([k]) });
    expect(r.body).toMatchObject({ status: 'proposed', proposedBy: 'agent', approvedAt: null });
    const many = Array.from({ length: 65 }, (_, i) => kernelInput({ name: `k_${i}`, extra: ` // ${i}` }));
    expect((await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody(many) })).body.error).toBe('limit_exceeded');
    expect((await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody([k], { reps: 65 }) })).body.error).toBe('limit_exceeded');
    expect((await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody([{ ...k, samples: [0, 16], expect: [0, 0] }]) })).body.message).toMatch(/samples must be/);
    expect((await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody([{ ...k, expect: k.expect.slice(1) }]) })).body.message).toMatch(/expect must hold/);
    expect((await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody([{ ...k, source: 'int main() {}' }]) })).body.message).toMatch(/no __global__ function/);
    expect((await s.json('POST', '/api/jobs', { proposer: 'user', body: { ...jobBody([k]), reason: '' } })).body.message).toMatch(/reason/);
    expect((await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody([k], { mode: 'memory' }) })).body.message).toMatch(/has no mode memory \(timing, counters, timeline\)/);
    const broke = makeServer({ hosts: [hostProfile('fake', d.url)], config: { agentBudgetSec: 0 } });
    const refused = await broke.json('POST', '/api/jobs', { proposer: 'agent', body: jobBody([k]) });
    expect([refused.status, refused.body.error]).toEqual([429, 'agent_budget_exhausted']);
  });

  it('a capture with runs is cached, and a job with nothing left to execute is refused', async () => {
    const s = makeServer({ hosts: [hostProfile('fake', d.url)] });
    const body = { ...jobBody([kernelInput()], { approve: true, reps: 1 }), captures: [{ kind: 'kiln-kernels/1', input: kernelInput() }] };
    const first = await s.json('POST', '/api/jobs', { proposer: 'user', body });
    await s.jobs.idle();
    expect(s.jobs.view(first.body.id)!.status).toBe('done');
    const again = await s.json('POST', '/api/jobs', { proposer: 'user', body });
    expect([again.status, again.body.error, again.body.verdicts[0].verdict]).toEqual([409, 'nothing_to_execute', 'cached']);
  });
});

describe('the job lifecycle on a driver', () => {
  let d: FakeDriver;
  beforeAll(async () => void (d = await startDriver()));
  afterAll(() => d.stop());

  it('proposed → approved → running → importing → done: one valid record per kernel, runs, an archive', async () => {
    const s = makeServer({ hosts: [hostProfile('fake', d.url)] });
    const events = listen(s);
    const ks = [kernelInput({ name: 'k_a', row: 'MAP=row' }), kernelInput({ name: 'k_b', row: 'MAP=thread', extra: ' // b' }), kernelInput({ name: 'k_c', row: 'MAP=tiled', extra: ' // c' })];
    const created = await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody(ks, { reps: 4, seed: 9 }) });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    expect(created.body).toMatchObject({ status: 'proposed', host: 'fake', groups: 1, steps: 4, captures: [{ verdict: 'execute', label: 'k_a MAP=row', mode: 'timing' }, {}, {}] });
    await s.json('POST', `/api/jobs/${id}/approve`);
    await s.jobs.idle();
    const job = (await s.json('GET', `/api/jobs/${id}`)).body;
    expect(job).toMatchObject({ status: 'done', error: null, proposedBy: 'user', protocol: { reps: 4, warmup: 1, launches: 5, seed: 9 } });
    expect(job.archive).toMatch(/^[0-9a-f]{64}$/);
    expect(job.executorSeconds).toBeGreaterThan(0);
    expect(statuses(events, id)).toEqual(['proposed', 'approved', 'running', 'importing', 'done']);
    const kinds = job.events.map((e: { kind: string }) => e.kind).filter((k: string) => k !== 'step.output');
    expect(kinds.slice(0, 4)).toEqual(['proposed', 'approved', 'submitted', 'job.queued']);
    expect(kinds.filter((k: string) => k === 'step.finished')).toHaveLength(4);
    expect(kinds.slice(-2)).toEqual(['result', 'done']);
    expect(job.events.some((e: { kind: string; detail: string }) => e.kind === 'step.output' && /k_b\s+\d/.test(e.detail))).toBe(true);
    expect(job.runs).toHaveLength(12);

    // every step ran in a container by image id, with the bundle read-only and no network
    const runs = d.runs().filter((a) => a.includes(`kiln.job=${id}`));
    expect(runs).toHaveLength(4);
    for (const a of runs) {
      expect(a.join(' ')).toMatch(/--network none/);
      expect(a.some((x) => x.endsWith(':/job/in:ro'))).toBe(true);
      expect(a).toContain(IMAGE);
      expect(a).not.toContain('kiln-perf:latest');
    }

    const records = (await s.json('GET', `/api/records?job=${id}`)).body.records as MeasurementRecord[];
    expect(records.map((r) => r.kernel.name).sort()).toEqual(['k_a', 'k_b', 'k_c']);
    expect([...job.records].sort()).toEqual(records.map((r) => r.id).sort());
    const dev = cudaDevice(FAKE_DEVICE, 'fakehost');
    for (const r of records) {
      const k = ks.find((x) => x.name === r.kernel.name)!;
      expect(validateRecord(r).errors).toEqual([]);
      expect(r).toMatchObject({
        by: 'job', device: { id: dev.id, class: 'cuda', name: 'CUDA Fake H100' }, kernel: { contentId: k.contentId, lang: 'cuda', row: k.row },
        timing: { kind: 'cuda-events', launches: 5, warmup: 1, scope: 'isolated' }, validity: { ok: true }, protocol: { reps: 4, seed: 9, pairId: id },
        manifest: { codegen: 'kiln-codegen/1', app: 'kiln-server/0.1', runner: 'fake_runner/1', host: 'fakehost', job: id, archive: job.archive },
        environment: { name: 'kiln-perf', image: IMAGE }, collectors: ['cuda-events', 'gpu-sampler', 'ptxas'],
      });
      expect(r.timing.samples).toHaveLength(4);
      expect(r.timing.raw!.every((rep) => rep.length === 5)).toBe(true);
      expect(r.check).toEqual({ ok: true, sampled: 16, maxAbsErr: 0, detail: 'max abs diff 0.00e+0' });
      expect(r.counts).toEqual({ regs: 32 });
      // the kernel's place in each repetition is the seeded shuffle's
      const i = ks.indexOf(k);
      expect(r.protocol.position).toEqual([0, 1, 2, 3].map((rep) => repetitionOrder(3, 9, rep).indexOf(i)));
    }
    expect(events.find((e) => e.type === 'records.added')?.data).toEqual({ job: id, ids: expect.any(Array) });
    expect((await s.json('GET', '/api/devices')).body.devices).toEqual([expect.objectContaining({ id: dev.id, host: 'fake', records: 3 })]);

    // one run per capture and repetition, with the kernel, the GPU samples and the link to the page's identity
    const catalog = (await s.json('GET', '/api/lab/catalog')).body;
    const capture = job.captures[0].capture as string;
    expect(catalog[capture]).toMatchObject({ origin: 'job', source: `job:${id}`, host: 'fake', reps: 4, kind: 'kiln-kernels/1' });
    const bundles = (await s.json('GET', `/api/lab/bundles?hashes=${capture}`)).body[capture];
    expect(bundles).toHaveLength(4);
    expect(bundles[0].run).toMatchObject({ kind: 'run', mode: 'timing', workload: 'kiln-kernels/1', validity: { ok: true }, measured: true, manifest: { job: id, captureId: capture } });
    expect(bundles[0].entities.some((e: { kind: string; lane?: string }) => e.kind === 'kernel' && e.lane === 'gpu:isolated')).toBe(true);
    expect(bundles[0].entities.some((e: { kind: string; lane?: string }) => e.kind === 'sample' && e.lane === 'conditions:gpu')).toBe(true);
    expect(bundles[0].links).toContainEqual(expect.objectContaining({ rel: 'corresponds_to', to: 'kiln:identity:id-k_a' }));

    // the archive is listed and served; the plan is kept
    expect((await s.json('GET', '/api/archives')).body).toContainEqual(expect.objectContaining({ sha256: job.archive, job: id }));
    expect((await s.call('GET', `/api/archives/${job.archive}`)).headers.get('content-type')).toBe('application/gzip');
    expect((await s.json('GET', `/api/jobs/${id}/plan`)).body).toMatchObject({ format: 'kiln-plan/1', job: id });
  });

  it('a user job created with approve: true runs at once', async () => {
    const s = makeServer({ hosts: [hostProfile('fake', d.url)] });
    const r = await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody([kernelInput()], { approve: true }) });
    expect(r.body.approvedAt).not.toBeNull();
    await s.jobs.idle();
    expect(s.jobs.view(r.body.id)!.status).toBe('done');
  });

  it("keeps each kernel's context in its record, and refuses a malformed one", async () => {
    const s = makeServer({ hosts: [hostProfile('fake', d.url)] });
    const at = (degree: number) => ({ preset: 'W-18', project: 'roofline', params: { elements: 4096, degree }, script: 'a'.repeat(64) });
    const body = jobBody([{ ...kernelInput({ name: 'k_d8' }), context: at(8) }, { ...kernelInput({ name: 'k_d16', extra: ' // 16' }), context: at(16) }, kernelInput({ name: 'k_none', extra: ' // none' })], { approve: true, reps: 1 });
    const id = (await s.json('POST', '/api/jobs', { proposer: 'user', body })).body.id;
    await s.jobs.idle();
    const byName = Object.fromEntries(((await s.json('GET', `/api/records?job=${id}`)).body.records as MeasurementRecord[]).map((r) => [r.kernel.name, r]));
    expect(byName.k_d8!.context).toEqual(at(8));
    expect(byName.k_d16!.context).toEqual(at(16));
    expect('context' in byName.k_none!).toBe(false);
    const k = kernelInput();
    expect((await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody([{ ...k, context: { params: { shape: [1, 2] } } as never }]) })).body.message).toMatch(/captures\[0\]\.input\.context\.params: expected a flat object/);
    expect((await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody([{ ...k, context: { knobs: {} } as never }]) })).body.message).toMatch(/captures\[0\]\.input\.context\.knobs: unknown field/);
  });

  it('an output that differs from the page reference makes the record invalid, with the reason', async () => {
    const s = makeServer({ hosts: [hostProfile('fake', d.url)] });
    const k = kernelInput({ expect: Array.from({ length: 16 }, (_, i) => (i === 3 ? 0.5 : i === 5 ? null : Math.fround(Math.sin(i)))) });
    const id = (await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody([k], { approve: true }) })).body.id;
    await s.jobs.idle();
    const [r] = (await s.json('GET', `/api/records?job=${id}`)).body.records as MeasurementRecord[];
    expect(s.jobs.view(id)!.status).toBe('done');
    expect(r!.validity.ok).toBe(false);
    expect(r!.validity.reasons[0]).toMatch(/^output check: 1 of 15 values differ \(first at 3: 0\.14\d* vs 0\.5\).*\(1 samples skipped: the reference is NaN there\)$/);
    expect(r!.check.ok).toBe(false);
  });

  it("queues a host's jobs on its driver in approval order and runs them one at a time", async () => {
    const s = makeServer({ hosts: [hostProfile('fake', d.url)] });
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) ids.push((await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody([kernelInput({ extra: ` // q${i}` })], { reps: 2, approve: true }) })).body.id);
    await s.jobs.idle();
    const views = ids.map((id) => s.jobs.view(id)!);
    expect(views.map((v) => v.status)).toEqual(['done', 'done', 'done']);
    // the driver may still be finishing the previous test's job: positions are relative
    const positions = views.map((v) => Number(/position (\d+)/.exec(v.events!.find((e) => e.kind === 'job.queued')!.detail)![1]));
    expect(positions.map((p) => p - positions[0]!)).toEqual([0, 1, 2]);
    for (let i = 1; i < 3; i++) expect(views[i]!.startedAt! >= views[i - 1]!.startedAt!).toBe(true);
  });

  it('cancels a proposed job, and refuses to cancel or approve a finished one', async () => {
    const s = makeServer({ hosts: [hostProfile('fake', d.url)] });
    const id = (await s.json('POST', '/api/jobs', { proposer: 'agent', body: jobBody([kernelInput()]) })).body.id;
    expect((await s.json('POST', `/api/jobs/${id}/cancel`)).body.status).toBe('cancelled');
    expect((await s.json('POST', `/api/jobs/${id}/approve`)).body.error).toBe('bad_state');
    expect((await s.json('POST', `/api/jobs/${id}/cancel`)).body.error).toBe('bad_state');
    expect((await s.json('POST', '/api/jobs/job-nope/approve')).status).toBe(404);
    expect((await s.json('GET', '/api/jobs/job-nope')).status).toBe(404);
  });

  it('imports a stored archive again without duplicating records', async () => {
    const s = makeServer({ hosts: [hostProfile('fake', d.url)] });
    const id = (await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody([kernelInput()], { approve: true, reps: 2 }) })).body.id;
    await s.jobs.idle();
    const before = s.jobs.view(id)!.records;
    const r = await s.json('POST', `/api/jobs/${id}/reimport`);
    expect(r.body.records).toEqual(before);
    expect(r.body.events.at(-1)).toMatchObject({ kind: 'reimported', detail: '2 runs, 0 new records' });
  });
});

describe('failures, cancellation and restarts', () => {
  it('a kernel the runner fails on gets an invalid record; the others stay valid', async () => {
    const d = await startDriver({ env: { KILN_FAKE_FAIL: 'k_bad' } });
    try {
      const s = makeServer({ hosts: [hostProfile('fake', d.url)] });
      const id = (await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody([kernelInput({ name: 'k_ok' }), kernelInput({ name: 'k_bad', extra: ' // bad' })], { approve: true }) })).body.id;
      await s.jobs.idle();
      const records = (await s.json('GET', `/api/records?job=${id}`)).body.records as MeasurementRecord[];
      const bad = records.find((r) => r.kernel.name === 'k_bad')!, ok = records.find((r) => r.kernel.name === 'k_ok')!;
      expect(s.jobs.view(id)!.status).toBe('done');
      expect(ok.validity.ok).toBe(true);
      expect(bad.timing.samples).toEqual([]);
      expect(bad.validity.reasons).toEqual(['repetition error: repetition 0: fake failure', 'repetition error: repetition 1: fake failure', 'repetition error: repetition 2: fake failure', 'small n: 0 of 3 repetitions completed']);
    } finally {
      await d.stop();
    }
  });

  it('a runner that exits with an error fails its repetition: the job is done, the record says why', async () => {
    const d = await startDriver({ env: { KILN_FAKE_COUNTER: join(tempDir(), 'n'), KILN_FAKE_EXIT_AT: '2' } });
    try {
      const s = makeServer({ hosts: [hostProfile('fake', d.url)] });
      const id = (await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody([kernelInput()], { approve: true }) })).body.id;
      await s.jobs.idle();
      expect(s.jobs.view(id)!.status).toBe('done');
      const [r] = (await s.json('GET', `/api/records?job=${id}`)).body.records as MeasurementRecord[];
      expect(r!.timing.samples).toHaveLength(2);
      expect(r!.validity.reasons).toEqual(['repetition error: repetition 1: the runner exited with 3: fake runner: invocation 2 fails', 'small n: 2 of 3 repetitions completed']);
    } finally {
      await d.stop();
    }
  });

  it('cancels a running job: its container is killed, completed repetitions are kept as invalid records', async () => {
    const d = await startDriver({ env: { KILN_FAKE_COUNTER: join(tempDir(), 'n'), KILN_FAKE_DELAY_MS: '30000', KILN_FAKE_DELAY_FROM: '3' } });
    try {
      const s = makeServer({ hosts: [hostProfile('fake', d.url)] });
      const events = listen(s);
      const id = (await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody([kernelInput()], { reps: 5, approve: true }) })).body.id;
      await waitFor(() => jobEvents(events, 'step.started').length === 3);
      const t0 = Date.now();
      const r = await s.json('POST', `/api/jobs/${id}/cancel`);
      expect(Date.now() - t0).toBeLessThan(10_000);
      expect(r.body.status).toBe('cancelled');
      expect(r.body.archive).toMatch(/^[0-9a-f]{64}$/);
      const [rec] = (await s.json('GET', `/api/records?job=${id}`)).body.records as MeasurementRecord[];
      expect(rec!.timing.samples).toHaveLength(2);
      expect(rec!.validity.reasons).toEqual(['small n: 2 of 5 repetitions completed', 'job cancelled after 2 of 5 repetitions']);
      await waitFor(() => d.containers().length === 0, 5000);
    } finally {
      await d.stop();
    }
  });

  it('stops an agent job when the daily budget runs out: the job fails with the budget as its reason', async () => {
    const d = await startDriver({ env: { KILN_FAKE_DELAY_MS: '300' } });
    try {
      const s = makeServer({ hosts: [hostProfile('fake', d.url)], config: { agentBudgetSec: 0.5 } });
      const id = (await s.json('POST', '/api/jobs', { proposer: 'agent', body: jobBody([kernelInput()], { reps: 10 }) })).body.id;
      await s.json('POST', `/api/jobs/${id}/approve`);
      await s.jobs.idle();
      const job = s.jobs.view(id)!;
      expect(job.status).toBe('failed');
      expect(job.error).toBe("the agents' budget of 0.5 executor seconds per 24 hours is spent");
      expect(job.executorSeconds).toBeLessThan(5);
      const [rec] = (await s.json('GET', `/api/records?job=${id}`)).body.records as MeasurementRecord[];
      expect(rec!.validity.reasons).toContain("job failed: the agents' budget of 0.5 executor seconds per 24 hours is spent");
      expect((await s.json('POST', '/api/jobs', { proposer: 'agent', body: jobBody([kernelInput()]) })).body.error).toBe('agent_budget_exhausted');
    } finally {
      await d.stop();
    }
  });

  it('a restarted server follows its jobs from the last stored event and imports their archives', async () => {
    const d = await startDriver({ env: { KILN_FAKE_DELAY_MS: '400' } });
    try {
      const dataDir = tempDir(), dbFile = join(dataDir, 'kiln.sqlite');
      const s1 = makeServer({ hosts: [hostProfile('fake', d.url)], dataDir, dbFile });
      const events = listen(s1);
      const id = (await s1.json('POST', '/api/jobs', { proposer: 'user', body: jobBody([kernelInput()], { reps: 4, approve: true }) })).body.id;
      await waitFor(() => jobEvents(events, 'step.finished').length > 0);
      s1.jobs.close();
      await s1.jobs.idle();
      s1.db.close();
      const s2 = makeServer({ hosts: [hostProfile('fake', d.url)], dataDir, dbFile });
      expect(s2.jobs.resume()).toBe(1);
      await s2.jobs.idle();
      const job = s2.jobs.view(id)!;
      expect(job.status).toBe('done');
      expect(job.events!.filter((e) => e.kind === 'driver.started')).toHaveLength(1);
      expect(job.events!.filter((e) => e.kind === 'step.finished')).toHaveLength(4);
      expect(job.records).toHaveLength(1);
    } finally {
      await d.stop();
    }
  });

  it('a driver restarted mid-job ends it failed with a partial archive, and no container is left', async () => {
    const d = await startDriver({ env: { KILN_FAKE_COUNTER: join(tempDir(), 'n'), KILN_FAKE_DELAY_MS: '30000', KILN_FAKE_DELAY_FROM: '2' } });
    try {
      const s = makeServer({ hosts: [hostProfile('fake', d.url)] });
      const events = listen(s);
      const id = (await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody([kernelInput()], { reps: 3, approve: true }) })).body.id;
      await waitFor(() => jobEvents(events, 'step.started').length === 2);
      await d.restart();
      await s.jobs.idle();
      const job = s.jobs.view(id)!;
      expect(job.status).toBe('failed');
      expect(job.error).toBe('driver restarted while the job was running');
      expect(job.archive).toMatch(/^[0-9a-f]{64}$/);
      const [rec] = (await s.json('GET', `/api/records?job=${id}`)).body.records as MeasurementRecord[];
      expect(rec!.timing.samples).toHaveLength(1);
      expect(rec!.validity.reasons).toContain('job failed: driver restarted while the job was running');
      await waitFor(() => d.containers().length === 0, 5000);
    } finally {
      await d.stop();
    }
  });

  it('two drivers on one GPU queue on its lock: the waiting job names the holder', async () => {
    const lockDir = join(tempDir(), 'lock');
    const a = await startDriver({ lockDir, env: { KILN_FAKE_DELAY_MS: '1500' } });
    const b = await startDriver({ lockDir });
    try {
      const s = makeServer({ hosts: [hostProfile('one', a.url), hostProfile('two', b.url)] });
      const events = listen(s);
      const first = (await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody([kernelInput()], { reps: 1, approve: true, host: 'one' }) })).body.id;
      await waitFor(() => jobEvents(events, 'lock.acquired').some((e) => (e.data as { job: string }).job === first));
      const second = (await s.json('POST', '/api/jobs', { proposer: 'user', body: jobBody([kernelInput({ extra: ' // 2' })], { reps: 1, approve: true, host: 'two' }) })).body.id;
      await s.jobs.idle();
      const waited = s.jobs.view(second)!.events!.find((e) => e.kind === 'lock.waiting');
      expect(waited?.detail).toContain(`held by ${first}`);
      expect(s.jobs.view(first)!.status).toBe('done');
      expect(s.jobs.view(second)!.status).toBe('done');
    } finally {
      await a.stop();
      await b.stop();
    }
  });
});
