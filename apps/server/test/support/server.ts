// Test harness: the whole application over an in-memory database and a temporary data directory, the fake runner
// behind the real CudaRunnerExecutor, and helpers that build valid job kernels.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalSource, contentId, sha256Hex } from '@kiln/evidence';
import { createApp } from '../../src/app.ts';
import { loadConfig, type ServerConfig } from '../../src/config.ts';
import { now, openDb } from '../../src/db.ts';
import { Devices } from '../../src/devices.ts';
import { EventBus } from '../../src/events.ts';
import { CudaRunnerExecutor } from '../../src/executors/cuda-runner.ts';
import type { Executor } from '../../src/executors/types.ts';
import { Jobs, type JobKernelInput } from '../../src/jobs.ts';
import { newToken } from '../../src/security.ts';

export const FAKE_RUNNER = fileURLToPath(new URL('./fake-runner.mjs', import.meta.url));
export const HOST = '127.0.0.1:5280';
export const CODEGEN = 'kiln-codegen/1';

/** The guide's FakeRunnerExecutor: the real executor running the fake runner script with Node. */
export const fakeExecutor = (env: Record<string, string> = {}, id = 'fake'): CudaRunnerExecutor =>
  new CudaRunnerExecutor({ id, target: 'local', python: process.execPath, runner: FAKE_RUNNER, env, killGraceMs: 200 });

export const tempDir = (): string => mkdtempSync(join(tmpdir(), 'kiln-server-'));

export interface CallOpts {
  body?: unknown;
  headers?: Record<string, string>;
  token?: string | null;
  proposer?: 'user' | 'agent';
}

export function makeServer({ executors = [fakeExecutor()], config: overrides = {}, dbFile = ':memory:' }: { executors?: Executor[]; config?: Partial<ServerConfig>; dbFile?: string } = {}) {
  const dataDir = tempDir();
  const config = loadConfig({ dataDir, dbFile, dist: join(dataDir, 'dist'), labWorkloads: join(dataDir, 'workloads'), executorsFile: join(dataDir, 'executors.json'), repTimeoutMs: 10_000, pingMs: 60_000, ...overrides }, {});
  const db = openDb(config.dbFile);
  const bus = new EventBus();
  const devices = new Devices(db, bus, new Map(executors.map((e) => [e.id, e])));
  const jobs = new Jobs(db, bus, devices, config);
  const token = newToken();
  const app = createApp({ config, db, bus, devices, jobs, token, startedAt: now() });
  const call = (method: string, path: string, o: CallOpts = {}) => {
    const write = method !== 'GET' && method !== 'HEAD';
    const tok = o.token === undefined ? token : o.token;
    const headers: Record<string, string> = {
      host: HOST,
      ...(write ? { 'content-type': 'application/json' } : {}),
      ...(write && tok ? { 'x-kiln-token': tok } : {}),
      ...(o.proposer ? { 'x-kiln-proposer': o.proposer } : {}),
      ...o.headers,
    };
    return app.request(`http://${HOST}${path}`, { method, headers, ...(o.body !== undefined ? { body: JSON.stringify(o.body) } : write ? { body: '{}' } : {}) });
  };
  const json = async (method: string, path: string, o: CallOpts = {}) => {
    const res = await call(method, path, o);
    return { status: res.status, body: (await res.json()) as any };
  };
  return { app, config, db, bus, devices, jobs, token, call, json };
}

/** The fake runner's default output at sample index i. */
export const fakeOutput = (i: number): number => Math.fround(Math.sin(i));

/** A valid job kernel whose content id is computed the way the page computes it (canonicalSource, contentId). */
export function jobKernel({ name = 'k_copy', row = 'MAP=row', n = 16, seed = 11, block = 64, extra = '', expect }: { name?: string; row?: string; n?: number; seed?: number; block?: number; extra?: string; expect?: (number | null)[] } = {}): JobKernelInput {
  const source = `extern "C" __global__ void __launch_bounds__(${block}) ${name}(const float* __restrict__ src0, float* __restrict__ dst) {\n  int i = blockIdx.x * ${block} + threadIdx.x;${extra}\n  if (i < ${n}) dst[i] = src0[i];\n}\n`;
  const launch = { grid: Math.ceil(n / block), block, smem: 0 };
  const inputs = [{ shape: [n], seed }];
  const samples = Array.from({ length: n }, (_, i) => i);
  return {
    name, identity: `id-${name}`, row, knobs: Object.fromEntries(row.split(',').map((kv) => kv.split('=') as [string, string])),
    contentId: contentId({ codegen: CODEGEN, lang: 'cuda', sourceSha256: sha256Hex(canonicalSource(source, name)), launch, inputs, output: [n], target: null }),
    source, launch, inputs, output: [n], samples, expect: expect ?? samples.map(fakeOutput),
  };
}

export const jobBody = (kernels: JobKernelInput[], o: { reps?: number; approve?: boolean; executor?: string; seed?: number } = {}) => ({
  executor: o.executor ?? 'fake',
  reason: 'test',
  codegen: CODEGEN,
  protocol: { reps: o.reps ?? 3, warmup: 1, launches: 5, seed: o.seed ?? 1 },
  kernels,
  ...(o.approve !== undefined ? { approve: o.approve } : {}),
});
