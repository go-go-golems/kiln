// Files the server stages into job bundles, by asset name (WorkloadKind.assets): the runner and launcher scripts, and
// Perf Lab's workload sources. A staged file's hash enters the plan, so a changed script never needs a rebuilt image.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
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

/** The revision of the lab workload sources in `dir`, as probe.py's workloads_revision computes it: sha256 over every
 * `*.py` in name order, name bytes then file bytes, first 12 hex digits. Lab programs put it into their arms' identity. */
export function workloadsRevision(dir: string): string {
  const h = createHash('sha256');
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.py')).sort()) h.update(name).update(readFileSync(join(dir, name)));
  return h.digest('hex').slice(0, 12);
}
