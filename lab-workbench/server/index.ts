import { serve } from '@hono/node-server';
import { createApp } from './app';
import { createPiCatalog } from './assistant/model';
import { PiAssistant } from './assistant/service';
import { loadConfig } from './config';
import { now, openDb } from './db';
import { EventBus } from './events';
import { probeLocal, type ProbeResult } from './probe';
import { processExecutor, Runner } from './runner';
import { failInterruptedJobs } from './store';

const config = loadConfig();
const db = openDb(config.dbFile);
const interrupted = failInterruptedJobs(db);
const bus = new EventBus();
const runner = new Runner(db, bus, { local: processExecutor(config) }, { dataDir: config.dataDir, config });

let probe: ProbeResult | undefined;
void probeLocal(config).then((p) => {
  probe = p;
  process.stdout.write(p.ok ? `probe: local ${p.capabilities.cpu.name}, torch ${p.capabilities.tools.torch} (${p.ms} ms)\n` : `probe failed: ${p.error}\n`);
});

const assistant = new PiAssistant(db, createPiCatalog().then((r) => {
  process.stdout.write(r.ok ? `assistant: ${r.catalog.list().length} models via pi, default ${config.model}\n` : `assistant unavailable: ${r.reason}\n`);
  return r;
}), config.model);

const app = createApp({ config, db, bus, runner, probe: () => probe, assistant, startedAt: now() });
serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
  process.stdout.write(`perf-lab server on http://${info.address}:${info.port}/api · db ${config.dbFile}${interrupted ? ` · ${interrupted} interrupted jobs failed` : ''}\n`);
});

const shutdown = () => {
  db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
