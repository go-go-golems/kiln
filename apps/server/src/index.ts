// `pnpm --filter @kiln/server start`: the server on http://127.0.0.1:5280 (guide §30.1), with the hosts of
// kiln-hosts/1 (KILN-003 guide §13.1). Jobs a previous process left on a driver are followed again.
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { now, openDb } from './db.ts';
import { EventBus } from './events.ts';
import { assetReader } from './exec/assets.ts';
import { Hosts, loadHosts } from './exec/hosts.ts';
import { Jobs } from './exec/jobs.ts';
import { newToken } from './security.ts';

const config = loadConfig();
const db = openDb(config.dbFile);
const bus = new EventBus();
const { hosts: profiles, errors } = loadHosts(config);
for (const e of errors) process.stderr.write(`hosts: ${e}\n`);
const hosts = new Hosts(profiles, { driverFile: join(config.runnerDir, 'kiln_driver.py'), probeTtlMs: config.probeTtlMs, bus });
const jobs = new Jobs(db, bus, hosts, { dataDir: config.dataDir, agentBudgetSec: config.agentBudgetSec, asset: assetReader(config), pollWaitS: config.pollWaitS });
const resumed = jobs.resume();
const app = createApp({ config, db, bus, hosts, jobs, token: newToken(), startedAt: now() });

serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
  process.stdout.write(
    `kiln server on http://${info.address}:${info.port}/ · db ${config.dbFile} · hosts ${hosts.ids().join(', ') || 'none'}` +
      `${resumed ? ` · following ${resumed} job${resumed === 1 ? '' : 's'}` : ''}\n`,
  );
  for (const id of hosts.ids()) hosts.capabilities(id).catch((e: Error) => process.stderr.write(`probe ${id}: ${e.message}\n`));
});

const shutdown = () => {
  jobs.close();
  db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
