// Executor profiles from KILN_EXECUTORS (default <data dir>/executors.json, guide §30.5):
//   { "executors": [ { "id": "rtx-dev", "target": "ssh", "host": "playback@playback-rtx-dev", "python": "python3",
//                      "runnerDir": "~/.cache/kiln-runner", "env": { "KILN_ARCH": "native" } } ] }
// Only CUDA runner executors can be configured; the fake runner the tests use is not reachable from here.
import { existsSync, readFileSync } from 'node:fs';
import type { ServerConfig } from '../config.ts';
import { CudaRunnerExecutor } from './cuda-runner.ts';
import type { Executor } from './types.ts';

export function loadExecutors(config: Pick<ServerConfig, 'executorsFile' | 'runner'>): { executors: Executor[]; errors: string[] } {
  if (!existsSync(config.executorsFile)) return { executors: [], errors: [] };
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(config.executorsFile, 'utf8'));
  } catch (e) {
    return { executors: [], errors: [`${config.executorsFile}: ${(e as Error).message}`] };
  }
  const list = (json as { executors?: unknown })?.executors;
  if (!Array.isArray(list)) return { executors: [], errors: [`${config.executorsFile}: expected { "executors": [...] }`] };
  const executors: Executor[] = [], errors: string[] = [], ids = new Set<string>();
  for (const p of list as Record<string, unknown>[]) {
    try {
      if (typeof p !== 'object' || p === null) throw new TypeError('an executor profile must be an object');
      const env = p.env ?? {};
      if (typeof env !== 'object' || env === null || !Object.values(env).every((v) => typeof v === 'string')) throw new TypeError(`executor ${String(p.id)}: env must map names to strings`);
      const e = new CudaRunnerExecutor({
        id: String(p.id),
        target: p.target as 'local' | 'ssh',
        ...(typeof p.host === 'string' ? { host: p.host } : {}),
        ...(typeof p.python === 'string' ? { python: p.python } : {}),
        ...(typeof p.runnerDir === 'string' ? { runnerDir: p.runnerDir } : {}),
        env: env as Record<string, string>,
        runner: config.runner,
      });
      if (ids.has(e.id)) throw new TypeError(`executor ${e.id} is defined twice`);
      ids.add(e.id);
      executors.push(e);
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  return { executors, errors };
}
