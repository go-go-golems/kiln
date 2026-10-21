// Test harness: the whole application over an in-memory database and a temporary data directory, talking HTTP to a
// real kiln_driver.py on an ephemeral port. The driver runs with the fake `docker` and `nvidia-smi` of bin/, so a
// step's container is a local process; the server stages fake_runner.py as the kiln-kernels/1 runner. Everything
// between the job API and the runner's results file is the production code path.
import { spawn, type ChildProcess } from 'node:child_process';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalSource, contentId, sha256Hex } from '@kiln/evidence';
import { parseHost, type KernelInput } from '@kiln/exec';
import { createApp } from '../../src/app.ts';
import { loadConfig, REPO, type ServerConfig } from '../../src/config.ts';
import { now, openDb } from '../../src/db.ts';
import { EventBus } from '../../src/events.ts';
import { assetReader } from '../../src/exec/assets.ts';
import { Hosts } from '../../src/exec/hosts.ts';
import { Jobs } from '../../src/exec/jobs.ts';
import { newToken } from '../../src/security.ts';

export const BIN = fileURLToPath(new URL('./bin', import.meta.url));
export const FAKE_RUNNER = fileURLToPath(new URL('./fake_runner.py', import.meta.url));
export const DRIVER = join(REPO, 'runner/kiln_driver.py');
export const HOST = '127.0.0.1:5280';
export const CODEGEN = 'kiln-codegen/1';

export const tempDir = (): string => mkdtempSync(join(tmpdir(), 'kiln-server-'));

const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => resolve(port));
    });
  });

export interface FakeDriver {
  url: string;
  root: string;
  lockDir: string;
  /** Every `docker run` argument vector the fake docker saw */
  runs(): string[][];
  /** Names of the fake containers still running */
  containers(): string[];
  stop(): Promise<void>;
  /** Kill the driver (SIGKILL: no clean-up) and start it again on the same root and port */
  restart(): Promise<void>;
}

const running = new Set<ChildProcess>();
process.on('exit', () => {
  for (const p of running) p.kill('SIGKILL');
});

/** A real driver with the fakes on PATH. `env` reaches the fake runner through the fake docker (KILN_FAKE_*). */
export async function startDriver({ env = {}, lockDir, driverFile = DRIVER }: { env?: Record<string, string>; lockDir?: string; driverFile?: string } = {}): Promise<FakeDriver> {
  const root = tempDir();
  const lock = lockDir ?? join(root, 'lock');
  mkdirSync(lock, { recursive: true });
  const state = join(root, 'docker-state');
  const log = join(root, 'docker-runs.ndjson');
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  let child!: ChildProcess;
  const start = async () => {
    child = spawn('python3', [driverFile, 'serve', '--root', join(root, 'driver'), '--listen', `127.0.0.1:${port}`, '--docker', join(BIN, 'docker'), '--nvidia-smi', join(BIN, 'nvidia-smi'), '--lock-dir', lock, '--hostname', 'fakehost'], {
      env: { ...process.env, KILN_FAKE_DOCKER_STATE: state, KILN_FAKE_DOCKER_LOG: log, KILN_FAKE_BIN: BIN, ...env },
      stdio: ['ignore', 'ignore', process.env.KILN_TEST_DRIVER_LOG ? 'inherit' : 'ignore'],
    });
    const c = child;
    running.add(c);
    c.once('exit', () => running.delete(c));
    for (let i = 0; i < 400; i++) {
      try {
        if ((await fetch(`${url}/v1/info`)).ok) return;
      } catch {
        // not listening yet
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error(`the driver did not start on ${url}`);
  };
  const exited = () => new Promise<void>((r) => (child.exitCode !== null || child.signalCode !== null ? r() : child.once('exit', () => r())));
  await start();
  return {
    url, root, lockDir: lock,
    runs: () => {
      try {
        return readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as string[]);
      } catch {
        return [];
      }
    },
    containers: () => (existsSync(state) ? readdirSync(state).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)) : []),
    async stop() {
      child.kill('SIGTERM');
      await exited();
    },
    async restart() {
      child.kill('SIGKILL');
      await exited();
      await start();
    },
  };
}

/** A copy of kiln_driver.py with one more line: a driver started from it is out of date, and the server replaces it. */
export function staleDriverCopy(): string {
  const file = join(tempDir(), 'kiln_driver.py');
  copyFileSync(DRIVER, file);
  appendFileSync(file, '# an older driver\n');
  return file;
}

export const hostProfile = (id: string, url: string, extra: Record<string, unknown> = {}) =>
  parseHost({ id, url, environments: { 'kiln-perf': { image: 'kiln-perf:latest', docker: { gpus: 'all' } } }, lock: { waitSeconds: 60 }, ...extra });

export interface CallOpts {
  body?: unknown;
  headers?: Record<string, string>;
  token?: string | null;
  proposer?: 'user' | 'agent';
}

export interface ServerOpts {
  hosts?: ReturnType<typeof hostProfile>[];
  config?: Partial<ServerConfig>;
  dataDir?: string;
  dbFile?: string;
}

export function makeServer({ hosts: profiles = [], config: overrides = {}, dataDir = tempDir(), dbFile = ':memory:' }: ServerOpts = {}) {
  const config = loadConfig({ dataDir, dbFile, dist: join(dataDir, 'dist'), labWorkloads: join(REPO, 'lab-workbench/workloads/perf_lab_local'), hostsFile: join(dataDir, 'hosts.json'), pingMs: 60_000, pollWaitS: 2, ...overrides }, {});
  const db = openDb(config.dbFile);
  const bus = new EventBus();
  const hosts = new Hosts(profiles, { driverFile: DRIVER, probeTtlMs: config.probeTtlMs, bus });
  const real = assetReader(config);
  // the fake runner stands in for kiln_runner.py: same command line, same files, no GPU
  const asset = (name: string) => (name === 'kiln_runner.py' ? readFileSync(FAKE_RUNNER) : real(name));
  const jobs = new Jobs(db, bus, hosts, { dataDir: config.dataDir, agentBudgetSec: config.agentBudgetSec, asset, pollWaitS: config.pollWaitS });
  const token = newToken();
  const app = createApp({ config, db, bus, hosts, jobs, token, startedAt: now() });
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
  return { app, config, db, bus, hosts, jobs, token, call, json };
}

/** The fake runner's default output at sample index i. */
export const fakeOutput = (i: number): number => Math.fround(Math.sin(i));

/** A valid kiln-kernels/1 input whose content id is computed the way the page computes it. */
export function kernelInput({ name = 'k_copy', row = 'MAP=row', n = 16, seed = 11, block = 64, extra = '', expect }: { name?: string; row?: string; n?: number; seed?: number; block?: number; extra?: string; expect?: (number | null)[] } = {}): KernelInput {
  const source = `extern "C" __global__ void __launch_bounds__(${block}) ${name}(const float* __restrict__ src0, float* __restrict__ dst) {\n  int i = blockIdx.x * ${block} + threadIdx.x;${extra}\n  if (i < ${n}) dst[i] = src0[i];\n}\n`;
  const launch = { grid: Math.ceil(n / block), block, smem: 0 };
  const inputs = [{ shape: [n], seed }];
  const samples = Array.from({ length: n }, (_, i) => i);
  return {
    codegen: CODEGEN, name, identity: `id-${name}`, row, knobs: Object.fromEntries(row.split(',').map((kv) => kv.split('=') as [string, string])),
    contentId: contentId({ codegen: CODEGEN, lang: 'cuda', sourceSha256: sha256Hex(canonicalSource(source, name)), launch, inputs, output: [n], target: null }),
    source, launch, inputs, output: [n], samples, expect: expect ?? samples.map(fakeOutput),
  };
}

/** A job body: every kernel one kiln-kernels/1 capture of one group, re-measured even when cached. */
export const jobBody = (kernels: KernelInput[], o: { reps?: number; approve?: boolean; host?: string; seed?: number; mode?: string; pairId?: string } = {}) => ({
  host: o.host ?? 'fake',
  reason: 'test',
  protocol: { reps: o.reps ?? 3, warmup: 1, launches: 5, seed: o.seed ?? 1 },
  captures: kernels.map((input) => ({ kind: 'kiln-kernels/1', mode: o.mode ?? 'timing', input, rerun: true, ...(o.pairId ? { pairId: o.pairId } : {}) })),
  ...(o.approve !== undefined ? { approve: o.approve } : {}),
});

export async function waitFor(pred: () => boolean | Promise<boolean>, ms = 15_000): Promise<void> {
  const t0 = Date.now();
  while (!(await pred())) {
    if (Date.now() - t0 > ms) throw new Error('waitFor: timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
}
