// Files the server stages into job bundles, by asset name (WorkloadKind.assets): the runner and launcher scripts, and
// Perf Lab's workload sources. A staged file's hash enters the plan, so a changed script never needs a rebuilt image.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ServerConfig } from '../config.ts';

export function assetReader(config: Pick<ServerConfig, 'runnerDir' | 'runtimeDir' | 'labWorkloads'>): (name: string) => Uint8Array {
  return (name) => {
    if (name === 'kiln_runner.py') return readFileSync(join(config.runnerDir, name));
    if (name === 'kiln_launch.py') return readFileSync(join(config.runtimeDir, name));
    if (/^perf_lab_local\/[a-z_]+\.py$/.test(name)) return readFileSync(join(dirname(config.labWorkloads), name));
    throw new Error(`no asset ${name}`);
  };
}
