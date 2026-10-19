// A development server with one fake CUDA executor, for driving the served workbench end to end without a GPU and
// without SSH (guide §30.5, Phase 5b). It is the production server (src/index.ts) with one difference: its only
// executor is the fake runner behind the real CudaRunnerExecutor, so spawning, stdin, stdout and the protocol are the
// production code paths. Its device reports itself as "Fake GPU (development)", and records from it name that device:
// they are development records, not measurements. Executor profiles (executors.json) cannot reach the fake runner.
//
//   KILN_DATA_DIR=<scratch dir> KILN_PORT=5288 node apps/server/test/support/serve-dev.ts
//
// The fake GPU computes correctly: before each repetition the executor writes the running job's reference values
// (the `expect` the page sent with each kernel) as the fake runner's outputs, so every output check passes and the
// records are valid. Times are the fake runner's deterministic per-name times with a ±2 % spread over launches.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from '../../src/app.ts';
import { loadConfig } from '../../src/config.ts';
import { get, now, openDb, type Db } from '../../src/db.ts';
import { Devices } from '../../src/devices.ts';
import { EventBus } from '../../src/events.ts';
import type { DeviceReport, Executor, KilnBundle, KilnResults } from '../../src/executors/types.ts';
import { Jobs } from '../../src/jobs.ts';
import { newToken } from '../../src/security.ts';
import { fakeExecutor } from './server.ts';

const DEV_DEVICE = { name: 'Fake GPU (development)', cc: '9.0', sms: 132, smemPerBlock: 49152, driver: 12080, driverVersion: '580.00-fake', persistenceMode: 'Enabled', maxSmClockMHz: 1980, maxMemClockMHz: 2619 };

/** The fake runner with the running job's reference values as its outputs. */
class DevExecutor implements Executor {
  readonly id: string;
  readonly target = 'local' as const;
  private readonly inner: Executor;
  private readonly db: Db;
  private readonly outputs: string;

  constructor(db: Db, dataDir: string, { id = 'dev-fake', delayMs = 400 }: { id?: string; delayMs?: number } = {}) {
    this.id = id;
    this.db = db;
    this.outputs = join(dataDir, `${id}-outputs.json`);
    writeFileSync(this.outputs, '{}');
    this.inner = fakeExecutor({ KILN_FAKE_DEVICE: JSON.stringify(DEV_DEVICE), KILN_FAKE_OUTPUTS: this.outputs, KILN_FAKE_DELAY_MS: String(delayMs) }, id);
  }

  get host(): string {
    return this.inner.host;
  }

  probe(signal?: AbortSignal): Promise<DeviceReport> {
    return this.inner.probe(signal);
  }

  runRepetition(bundle: KilnBundle, signal: AbortSignal, onLine?: (line: string) => void): Promise<KilnResults> {
    const job = get<{ spec_json: string }>(this.db, `select spec_json from jobs where status = 'running' and executor = ? limit 1`, this.id);
    const kernels = job ? (JSON.parse(job.spec_json) as { kernels: { name: string; row: string; expect: (number | null)[] }[] }).kernels : [];
    writeFileSync(this.outputs, JSON.stringify(Object.fromEntries(kernels.map((k) => [`${k.name}|${k.row}`, k.expect.map((v) => v ?? 0)]))));
    return this.inner.runRepetition(bundle, signal, onLine);
  }
}

const config = loadConfig();
const db = openDb(config.dbFile);
const bus = new EventBus();
const executor = new DevExecutor(db, config.dataDir);
const devices = new Devices(db, bus, new Map([[executor.id, executor]]));
const jobs = new Jobs(db, bus, devices, config);
const interrupted = jobs.failInterrupted();
const app = createApp({ config, db, bus, devices, jobs, token: newToken(), startedAt: now() });

serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
  process.stdout.write(`kiln DEVELOPMENT server on http://${info.address}:${info.port}/ · db ${config.dbFile} · executor ${executor.id}: the fake runner, "${DEV_DEVICE.name}"${interrupted ? ` · ${interrupted} interrupted` : ''}\n`);
  void devices.probe(executor.id);
  jobs.kick();
});

const shutdown = () => {
  db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
