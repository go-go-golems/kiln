// Phase 5's done-condition, end to end without a GPU: the page builds a job from two compiled schedules of one
// kernel (server-client.js jobSpec), the server runs it on the fake runner, and the records it stores, loaded into
// the page's EvidenceStore, make the greedy compile choose the faster schedule by evidence.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';
import { k } from '@kiln/kiln/core/kiln.js';
import { N } from '@kiln/kiln/std/tensor.js';
import { pipeline } from '@kiln/kiln/std/emmy.js';
import { SPECS, target } from '@kiln/kiln/std/targets.js';
import { EvidenceStore } from '@kiln/kiln/std/store.js';
import { activationOf } from '@kiln/kiln/std/records.js';
import { programOf } from '@kiln/kiln/std/program.js';
import { jobSpec } from '../../workbench/src/server-client.js';
import { hostProfile, makeServer, startDriver, tempDir } from './support/server.ts';

const g = k.trace('lin', ({ x }: any) => N.linear(x, N.weight('w', [256, 256])), { x: k.tensor([256, 256]) });
const compile = (store: unknown, device: any, decide?: unknown) =>
  pipeline({ target: device.target, store }).with(decide ? { decide } : {}).run(g, { ctx: { deviceId: device.evidenceId, store } });
const sched = (run: any) => run.decisions.find((d: any) => d.rule === 'schedule');

describe('records from a fake CUDA job drive a decision', () => {
  it('the faster measured schedule wins by evidence', async () => {
    const cuda: any = { id: 'cuda', kind: 'cuda', name: 'CUDA Fake H100', target: target(SPECS.rtx5090), evidenceId: 'cuda:unknown-00000000' };
    const r0 = compile(new EvidenceStore(), cuda);
    const d0 = sched(r0);
    expect(d0.by).toBe('model');
    const fav = d0.knobs;
    const other = d0.options.find((o: any) => k.knobs.canonical(o.knobs) !== k.knobs.canonical(fav)).knobs;
    const runFor = (knobs: unknown) => compile(null, cuda, k.decide.chain(k.decide.exactly(() => knobs), k.decide.first()));
    const runs = [runFor(fav), runFor(other)];
    const kernels = runs.map((r) => programOf(r.graph).kernels[0]);
    expect(kernels[0].row).not.toBe(kernels[1].row);

    // the page's job spec; the fake GPU computes correctly (outputs = the page's reference) and runs `other` 4× faster
    const spec = jobSpec(kernels, { host: 'fake', reason: 'which schedule is faster on CUDA', protocol: { reps: 5, warmup: 1, launches: 5 }, approve: true, activationOf: (kern: any) => activationOf(kern, { run: runs[kernels.indexOf(kern)] }) });
    const outputs = join(tempDir(), 'outputs.json');
    writeFileSync(outputs, JSON.stringify(Object.fromEntries(spec.captures.map(({ input: x }: any) => [`${x.name}|${x.row}`, x.expect.map((v: number | null) => v ?? 0)]))));
    const times = { [`${kernels[0].name}|${kernels[0].row}`]: 40, [`${kernels[1].name}|${kernels[1].row}`]: 10 };
    const d = await startDriver({ env: { KILN_FAKE_OUTPUTS: outputs, KILN_FAKE_TIMES: JSON.stringify(times) } });
    onTestFinished(() => d.stop());
    const s = makeServer({ hosts: [hostProfile('fake', d.url)] });
    const created = await s.json('POST', '/api/jobs', { proposer: 'user', body: spec });
    expect(created.status).toBe(201);
    await s.jobs.idle();
    expect(s.jobs.view(created.body.id)!.status).toBe('done');
    const records = (await s.json('GET', `/api/records?job=${created.body.id}`)).body.records;
    expect(records.map((r: any) => [r.validity.ok, r.activation.ok, r.check.ok])).toEqual([[true, true, true], [true, true, true]]);

    // the page loads the server's records; its CUDA device is the one the records name
    const store = new EvidenceStore();
    expect(store.import({ format: 'kiln-evidence/2', records })).toMatchObject({ added: 2, skipped: 0 });
    cuda.evidenceId = records[0].device.id;
    const d1 = sched(compile(store, cuda));
    expect(d1.by).toBe('evidence');
    expect(d1.note).toMatch(/separated/);
    expect(k.knobs.canonical(d1.knobs)).toBe(k.knobs.canonical(other));
  });
});
