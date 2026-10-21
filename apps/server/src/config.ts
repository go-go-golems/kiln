// Process configuration (guide §30.1). Every field can be overridden, so tests run the whole app against a
// temporary directory and an in-memory database.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repository root: apps/server/src → ../../.. */
export const REPO = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
export const VERSION = 'kiln-server/0.1';

export interface ServerConfig {
  /** Always loopback; the Host allow-list is built from it and the port */
  host: '127.0.0.1';
  port: number;
  dataDir: string;
  /** ':memory:' in tests */
  dbFile: string;
  /** Perf Lab's workload sources (perf_lab_local/): staged into the jobs of perf-lab-sampler/1 */
  labWorkloads: string;
  /** The built workbench (apps/workbench/dist); the server serves kiln-workbench.html from it */
  dist: string;
  /** Host profiles, kiln-hosts/1 (KILN-003 guide §13.1); a missing file means no hosts */
  hostsFile: string;
  /** runner/: kiln_driver.py (what every driver should run) and kiln_runner.py (staged into kernel jobs) */
  runnerDir: string;
  /** runtime/python/: kiln_launch.py */
  runtimeDir: string;
  /** How long a host's capability document is used before the next plan probes again */
  probeTtlMs: number;
  /** Seconds one events request to a driver waits for news */
  pollWaitS: number;
  /** Model for the agent gateway (Phase 7); null turns the gateway off (503 no_model) */
  model: string | null;
  /** The Anthropic Messages endpoint the gateway streams from (tests point it at a fake) */
  modelUrl: string;
  /** ANTHROPIC_API_KEY. Sent upstream only: never logged, returned in a response, or written to the database */
  apiKey: string | null;
  /** Executor seconds agent-proposed jobs may spend per rolling 24 hours (§30.4) */
  agentBudgetSec: number;
  /** Server-sent events keep-alive */
  pingMs: number;
}

export function loadConfig(overrides: Partial<ServerConfig> = {}, env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const dataDir = overrides.dataDir ?? resolve(env.KILN_DATA_DIR ?? resolve(REPO, 'apps/server/.data'));
  const port = overrides.port ?? Number(env.KILN_PORT ?? 5280);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`KILN_PORT must be a port number (got ${env.KILN_PORT})`);
  return {
    host: '127.0.0.1',
    port,
    dataDir,
    dbFile: resolve(dataDir, 'kiln.sqlite'),
    dist: resolve(env.KILN_DIST ?? resolve(REPO, 'apps/workbench/dist')),
    labWorkloads: resolve(env.KILN_LAB_WORKLOADS ?? resolve(REPO, 'lab-workbench/workloads/perf_lab_local')),
    hostsFile: resolve(env.KILN_HOSTS ?? resolve(dataDir, 'hosts.json')),
    runnerDir: resolve(REPO, 'runner'),
    runtimeDir: resolve(REPO, 'runtime/python'),
    probeTtlMs: 10 * 60_000,
    pollWaitS: 25,
    model: env.KILN_MODEL || null,
    modelUrl: env.KILN_MODEL_URL || 'https://api.anthropic.com/v1/messages',
    apiKey: env.ANTHROPIC_API_KEY || null,
    agentBudgetSec: 600,
    pingMs: 15_000,
    ...overrides,
  };
}
