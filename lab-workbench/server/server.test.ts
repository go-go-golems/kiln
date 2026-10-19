import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { hash, stableStringify } from '../src/lang/util';
import { makeValue, missing } from '../src/lang/values';
import { createApp } from './app';
import { pack, unpack } from './bundles';
import { loadConfig } from './config';
import { migrate, openDb, type Db } from './db';
import { EventBus } from './events';
import { importRepetition } from './importer';
import type { Executor } from './runner';
import { Runner } from './runner';

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'perf-lab-test-'));
  dirs.push(d);
  return d;
};
afterEach(() => dirs.splice(0));

/** Writes the files a timing repetition of the sampler script produces, without running Python. */
function writeTimingFixture(dir: string, latenciesMs: number[], activation: Record<string, unknown>) {
  mkdirSync(dir, { recursive: true });
  let t = 0;
  const requests = latenciesMs.map((ms, i) => {
    const r = { i, start_ns: t, end_ns: t + ms * 1e6, cpu_ns: ms * 0.9e6 };
    t = r.end_ns + 1e5;
    return r;
  });
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ device: 'cpu', dtype: 'float32', shape: { queries: 64, heads: 2, channels: 4, points: 4, spatial: 8 }, torch: '2.14.1', python: '3.12.14', numpy: '2.5.4', started_at: '2026-10-12T00:00:00Z', boundary: 'sampler_output' }));
  writeFileSync(join(dir, 'activation.json'), JSON.stringify(activation));
  writeFileSync(join(dir, 'quality.json'), JSON.stringify({ reference: 'unfused', maxAbsDiff: 1e-7, tolerance: 1e-5, pass: true }));
  writeFileSync(join(dir, 'timing.json'), JSON.stringify({ boundary: 'sampler_output', requests }));
}

const spec = (arm: string, impl: string) =>
  JSON.parse(
    stableStringify({
      schema_version: 1,
      experiment_id: 'sampler-test',
      arm,
      host: 'local',
      workload: { adapter: 'sampler', queries: 64, undefinedField: undefined },
      comparison: { switches: { impl }, paired_order_seed: 3 },
      expect: { expect: { compile: 'active' }, arm: 'candidate', onMiss: 'invalid' },
      collection: { mode: 'timing', requests: 3 },
      quality_gate_sha256: 'gate',
    }),
  ) as Record<string, unknown>;

const capture = (arm: string, impl: string, host = 'local') => {
  const s = spec(arm, impl);
  return { hash: hash(stableStringify(s)), ref: `sampler-test/${arm}/timing`, host, reps: 2, spec: s };
};

function harness(executor?: Executor) {
  const db: Db = openDb(':memory:');
  const bus = new EventBus();
  const runner = new Runner(db, bus, executor ? { local: executor } : {});
  const app = createApp({ config: loadConfig({ dataDir: tmp() }), db, bus, runner, probe: () => undefined, startedAt: 'now' });
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await app.request(`/api${path}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, json: (await res.json()) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
  return { db, runner, call };
}

describe('database', () => {
  it('applies migrations once', () => {
    const db = openDb(':memory:');
    expect(migrate(db)).toEqual([]);
    const tables = (db.prepare(`select name from sqlite_master where type = 'table' order by name`).all() as { name: string }[]).map((r) => r.name);
    expect(tables).toEqual(expect.arrayContaining(['artifacts', 'runs', 'run_bundles', 'jobs', 'conversations', 'messages', 'llm_calls']));
  });

  it('round-trips value records, so a missing value still compares as unknown after revival', () => {
    const packed = unpack<Record<string, unknown>[]>(pack([{ x: missing('not collected') }]));
    const raw = packed[0].x as Record<string, unknown>;
    expect(raw.__value).toBe(true);
    const revived = makeValue(raw as never);
    expect((revived as unknown as number) < 1).toBe(false);
    expect((revived as unknown as number) > 1).toBe(false);
  });
});

describe('importer', () => {
  it('turns timing output into requests and judges activation against the expectation', () => {
    const dir = join(tmp(), 'rep-0');
    writeTimingFixture(dir, [2, 3, 4], { impl: 'compiled', compile: 'inactive', reason: 'fallback' });
    const b = importRepetition({ dir, spec: spec('candidate', 'compiled'), hash: 'h', ref: 'sampler-test/candidate/timing', rep: 0, host: 'local', exitCode: 0 });
    const reqs = b.entities.filter((e) => e.kind === 'request');
    expect(reqs.map((r) => r.latency)).toEqual([2, 3, 4]);
    expect(reqs[0].ref).toBe('sampler-test/candidate/timing#0!request:r0-000');
    expect(b.run.validity).toEqual({ ok: false, reasons: ['activation: compile inactive (expected active)'] });
    expect((b.run.quality as { status: string }).status).toBe('unqualified');
    expect(b.run.synthetic).toBe(false);
  });

  it('reports a failed process as an invalid run rather than dropping it', () => {
    const dir = join(tmp(), 'rep-1');
    mkdirSync(dir);
    const b = importRepetition({ dir, spec: spec('baseline', 'unfused'), hash: 'h', ref: 'sampler-test/baseline/timing', rep: 1, host: 'local', exitCode: 1, stderrTail: 'Traceback\nRuntimeError: boom' });
    expect(b.run.validity).toEqual({ ok: false, reasons: ['process exited with 1: RuntimeError: boom'] });
  });
});

describe('api', () => {
  it('rejects a capture whose spec does not hash to its claimed hash', async () => {
    const { call } = harness();
    const c = capture('baseline', 'unfused');
    const r = await call('POST', '/jobs', { labId: 'l', captures: [{ ...c, hash: 'deadbeef' }] });
    expect(r.status).toBe(409);
    expect(r.json.error).toBe('spec_hash_mismatch');
  });

  it('seeds synthetic hosts only; a host with a real executor must be measured', async () => {
    const fake: Executor = { kind: 'process', run: async () => ({ exitCode: 0, stderrTail: '', dir: '' }) };
    const { call } = harness(fake);
    const r = await call('POST', '/labs/l/seed', { captures: [capture('baseline', 'unfused', 'local'), capture('baseline', 'unfused', 'playback@dgx')] });
    expect(r.json.seeded).toBe(1);
    const cat = await call('GET', '/catalog');
    expect(Object.values(cat.json).map((a) => (a as { host: string }).host)).toEqual(['playback@dgx']);
  });

  it('runs an approved job in paired order, imports every repetition and lists the artifacts as measured', async () => {
    const order: string[] = [];
    const root = tmp();
    const fake: Executor = {
      kind: 'process',
      async run(c, rep) {
        order.push(`${c.arm}#${rep}`);
        const dir = join(root, c.hash, `rep-${rep}`);
        writeTimingFixture(dir, [1 + rep, 2 + rep], c.arm === 'candidate' ? { impl: 'compiled', compile: 'active' } : { impl: 'unfused' });
        return { exitCode: 0, stderrTail: '', dir };
      },
    };
    const { call, runner } = harness(fake);
    const captures = [capture('baseline', 'unfused'), capture('candidate', 'compiled')];
    const proposed = await call('POST', '/jobs', { labId: 'l', captures, reason: 'test', proposedBy: 'assistant', approve: true });
    expect(proposed.json.status).toBe('proposed'); // the assistant cannot approve its own job
    await call('POST', `/jobs/${proposed.json.id}/approve`);
    await runner.idle();
    const job = await call('GET', `/jobs/${proposed.json.id}`);
    expect(job.json.status).toBe('done');
    expect(order.sort()).toEqual(['baseline#0', 'baseline#1', 'candidate#0', 'candidate#1']);
    const cat = await call('GET', '/catalog');
    expect(Object.keys(cat.json).sort()).toEqual(captures.map((c) => c.hash).sort());
    expect(Object.values(cat.json).every((a) => (a as { origin: string }).origin === 'measured')).toBe(true);
    const bundles = await call('GET', `/bundles?hashes=${captures[1].hash}`);
    expect(bundles.json[captures[1].hash].map((b: { run: { ref: string; validity: { ok: boolean } } }) => [b.run.ref, b.run.validity.ok])).toEqual([
      ['sampler-test/candidate/timing#0', true],
      ['sampler-test/candidate/timing#1', true],
    ]);
  });

  it('keeps the runs of two parameter values apart although their references are equal', async () => {
    const root = tmp();
    const fake: Executor = {
      kind: 'process',
      async run(c, rep) {
        const dir = join(root, c.hash, `rep-${rep}`);
        writeTimingFixture(dir, [Number((c.spec_json.match(/"queries":(\d+)/) ?? [])[1]) / 1000], { impl: 'unfused' });
        return { exitCode: 0, stderrTail: '', dir };
      },
    };
    const { call, runner } = harness(fake);
    const at = (queries: number) => {
      const s = JSON.parse(stableStringify({ ...spec('baseline', 'unfused'), workload: { adapter: 'sampler', queries } })) as Record<string, unknown>;
      return { hash: hash(stableStringify(s)), ref: 'sampler-test/baseline/timing', host: 'local', reps: 2, spec: s };
    };
    for (const q of [2048, 1024]) {
      await call('POST', '/jobs', { labId: 'l', captures: [at(q)], approve: true });
      await runner.idle();
    }
    const b = await call('GET', `/bundles?hashes=${at(2048).hash},${at(1024).hash}`);
    const latency = (h: string) => b.json[h].map((x: { entities: { latency: number }[] }) => x.entities[0].latency);
    expect(latency(at(2048).hash)).toEqual([2.048, 2.048]);
    expect(latency(at(1024).hash)).toEqual([1.024, 1.024]);
  });

  it('fails the job and keeps the artifact out of the catalog when a repetition exits non-zero', async () => {
    const root = tmp();
    const fake: Executor = {
      kind: 'process',
      async run(c, rep) {
        const dir = join(root, c.hash, `rep-${rep}`);
        mkdirSync(dir, { recursive: true });
        return { exitCode: 3, stderrTail: 'ValueError: bad spec', dir };
      },
    };
    const { call, runner } = harness(fake);
    const created = await call('POST', '/jobs', { labId: 'l', captures: [capture('baseline', 'unfused')], approve: true });
    await runner.idle();
    const job = await call('GET', `/jobs/${created.json.id}`);
    expect(job.json.status).toBe('failed');
    expect(job.json.error).toMatch(/exited with 3/);
    expect(Object.keys((await call('GET', '/catalog')).json)).toEqual([]);
  });
});
