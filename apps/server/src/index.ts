// `pnpm --filter @kiln/server start`: the server on http://127.0.0.1:5280 (guide §30.1).
import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { now, openDb } from './db.ts';
import { Devices } from './devices.ts';
import { EventBus } from './events.ts';
import { loadExecutors } from './executors/index.ts';
import { Jobs } from './jobs.ts';
import { newToken } from './security.ts';

const config = loadConfig();
const db = openDb(config.dbFile);
const bus = new EventBus();
const { executors, errors } = loadExecutors(config);
for (const e of errors) process.stderr.write(`executors: ${e}\n`);
const devices = new Devices(db, bus, new Map(executors.map((e) => [e.id, e])));
const jobs = new Jobs(db, bus, devices, config);
const interrupted = jobs.failInterrupted();
const app = createApp({ config, db, bus, devices, jobs, token: newToken(), startedAt: now() });

serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
  process.stdout.write(
    `kiln server on http://${info.address}:${info.port}/ · db ${config.dbFile} · ${executors.length} executor${executors.length === 1 ? '' : 's'}` +
      `${interrupted ? ` · ${interrupted} interrupted job${interrupted === 1 ? '' : 's'} failed` : ''}\n`,
  );
  for (const e of executors) void devices.probe(e.id);
  jobs.kick();
});

const shutdown = () => {
  db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
