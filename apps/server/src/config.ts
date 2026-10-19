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
  /** Perf Lab's workload sources; their content hash is host `local`'s workload revision (lab/probe.ts) */
  labWorkloads: string;
  /** The built workbench (apps/workbench/dist); the server serves kiln-workbench.html from it */
  dist: string;
  /** CUDA executor profiles (§30.5); a missing file means no executors */
  executorsFile: string;
  /** The runner the local executor runs and the SSH executor copies */
  runner: string;
  /** Model for the agent gateway (Phase 7); null turns the gateway off (503 no_model) */
  model: string | null;
  /** The Anthropic Messages endpoint the gateway streams from (tests point it at a fake) */
  modelUrl: string;
  /** ANTHROPIC_API_KEY. Sent upstream only: never logged, returned in a response, or written to the database */
  apiKey: string | null;
  /** Per-repetition timeout of a job (§30.4) */
  repTimeoutMs: number;
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
    executorsFile: resolve(env.KILN_EXECUTORS ?? resolve(dataDir, 'executors.json')),
    runner: resolve(REPO, 'runner/kiln_runner.py'),
    model: env.KILN_MODEL || null,
    modelUrl: env.KILN_MODEL_URL || 'https://api.anthropic.com/v1/messages',
    apiKey: env.ANTHROPIC_API_KEY || null,
    repTimeoutMs: 120_000,
    agentBudgetSec: 600,
    pingMs: 15_000,
    ...overrides,
  };
}
