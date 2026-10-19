import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

export interface ServerConfig {
  /** experiments/lab-workbench */
  root: string;
  dataDir: string;
  dbFile: string;
  artifactsDir: string;
  workloadsDir: string;
  host: string;
  port: number;
  /** provider/id:thinking, resolved through pi */
  model: string;
  uv: string;
}

export function loadConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  const dataDir = overrides.dataDir ?? process.env.PERF_LAB_DATA_DIR ?? resolve(root, '.data');
  return {
    root,
    dataDir,
    dbFile: resolve(dataDir, 'perf-lab.sqlite'),
    artifactsDir: resolve(dataDir, 'artifacts'),
    workloadsDir: resolve(root, 'workloads'),
    host: '127.0.0.1',
    port: Number(process.env.PERF_LAB_PORT ?? 5198),
    model: process.env.PERF_LAB_MODEL ?? 'lunaroute/deepseek-4.1-flash:high',
    uv: process.env.PERF_LAB_UV ?? 'uv',
    ...overrides,
  };
}
