// A development server with one fake CUDA host, for driving the served workbench end to end without a GPU (guide
// §30.5). It is the production server (src/index.ts) with one difference: its only host is a real kiln_driver.py on a
// free local port, started with the fake docker and nvidia-smi of bin/, and the kiln-kernels/1 runner it stages is
// fake_runner.py. Everything between the job API and the runner's results file is the production code path. Its
// device reports itself as "Fake GPU (development)", and records from it name that device: they are development
// records, not measurements. hosts.json is not read.
//
//   KILN_DATA_DIR=<scratch dir> KILN_PORT=5288 node apps/server/test/support/serve-dev.ts
//
// The fake GPU computes correctly: when a job is proposed, the server writes its kernels' reference values (the
// `expect` the page sent) as the fake runner's outputs, so every output check passes and the records are valid.
// Times are the fake runner's deterministic per-name times with a ±2 % spread over launches.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from '../../src/app.ts';
import { loadConfig } from '../../src/config.ts';
import { get, now, openDb } from '../../src/db.ts';
import { EventBus } from '../../src/events.ts';
import { assetReader } from '../../src/exec/assets.ts';
import { Hosts } from '../../src/exec/hosts.ts';
import { Jobs } from '../../src/exec/jobs.ts';
import { newToken } from '../../src/security.ts';
import { DRIVER, FAKE_RUNNER, hostProfile, startDriver } from './server.ts';

const DEV_DEVICE = { name: 'Fake GPU (development)', cc: '9.0', sms: 132, smemPerBlock: 49152, driver: 12080, driverVersion: '580.00-fake', persistenceMode: 'Enabled', maxSmClockMHz: 1980, maxMemClockMHz: 2619 };

const config = loadConfig();
const outputs = join(config.dataDir, 'dev-fake-outputs.json');
writeFileSync(outputs, '{}');
const driver = await startDriver({ env: { KILN_FAKE_DEVICE: JSON.stringify(DEV_DEVICE), KILN_FAKE_OUTPUTS: outputs, KILN_FAKE_DELAY_MS: process.env.KILN_DEV_DELAY_MS ?? '400' } });

const db = openDb(config.dbFile);
const bus = new EventBus();
const hosts = new Hosts([hostProfile('dev-fake', driver.url)], { driverFile: DRIVER, probeTtlMs: config.probeTtlMs, bus });
const real = assetReader(config);
const jobs = new Jobs(db, bus, hosts, { dataDir: config.dataDir, agentBudgetSec: config.agentBudgetSec, pollWaitS: config.pollWaitS, asset: (name) => (name === 'kiln_runner.py' ? readFileSync(FAKE_RUNNER) : real(name)) });

// the job's reference values become the fake runner's outputs before the job reaches the driver
bus.on((e) => {
  if (e.type !== 'job.updated' || (e.data as { status: string }).status !== 'proposed') return;
  const row = get<{ spec_json: string }>(db, 'select spec_json from jobs where id = ?', (e.data as { id: string }).id);
  const captures = row ? (JSON.parse(row.spec_json) as { captures: { kind: string; input: { name: string; row: string; expect: (number | null)[] } }[] }).captures : [];
  const known = JSON.parse(readFileSync(outputs, 'utf8')) as Record<string, number[]>;
  for (const c of captures) if (c.kind === 'kiln-kernels/1') known[`${c.input.name}|${c.input.row}`] = c.input.expect.map((v) => v ?? 0);
  writeFileSync(outputs, JSON.stringify(known));
});

const resumed = jobs.resume();
const app = createApp({ config, db, bus, hosts, jobs, token: newToken(), startedAt: now() });

serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
  process.stdout.write(`kiln DEVELOPMENT server on http://${info.address}:${info.port}/ · db ${config.dbFile} · host dev-fake: a local driver at ${driver.url} with the fake runner, "${DEV_DEVICE.name}"${resumed ? ` · following ${resumed} jobs` : ''}\n`);
  void hosts.capabilities('dev-fake').catch((err: Error) => process.stderr.write(`probing dev-fake failed: ${err.message}\n`));
});

const shutdown = async () => {
  jobs.close();
  await driver.stop();
  db.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
