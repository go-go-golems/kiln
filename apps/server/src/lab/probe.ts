// Host `local`'s capability report, without running anything (guide §33.3). Perf Lab's server ran a Python probe in
// the workloads environment (PL/workloads/perf_lab_local/probe.py). The Kiln server executes no lab work, so it
// reports only what it can read: this machine's CPU and memory, and `tools.workloads`, the content hash of the
// workload sources, computed exactly as the probe's `workloads_revision` computes it. That hash is the one field a
// local capture's identity depends on, so a local capture imported from Perf Lab matches when, and only when, the
// sources on disk are the ones it was measured with.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { arch, cpus, totalmem } from 'node:os';
import { join } from 'node:path';

export interface LocalReport {
  host: 'local';
  arch: 'arm64' | 'x86_64';
  cpu: { name: string; cores: number; coreClasses: string[] };
  memoryBytes: number | null;
  gpu: { name: string; count: number; precisions: string[] };
  devices: string[];
  tools: Record<string, string>;
  threads: number;
  counters: { unsupported: string[]; reason: string };
  synthetic: false;
}

/** sha256 over each `*.py` file's name then bytes, in name order, first 12 hex digits (probe.py `workloads_revision`). */
export function workloadsRevision(dir: string): string {
  const h = createHash('sha256');
  // Python sorts the Paths of one directory by name; for these ASCII names that is the same order as Array.sort
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.py')).sort()) {
    h.update(name);
    h.update(readFileSync(join(dir, name)));
  }
  return h.digest('hex').slice(0, 12);
}

/** The report for host `local`, or why there is none (no workload sources at `workloadsDir`). */
export function localReport(workloadsDir: string): LocalReport | { error: string } {
  if (!existsSync(workloadsDir)) return { error: `no Perf Lab workload sources at ${workloadsDir} (KILN_LAB_WORKLOADS)` };
  const cpu = cpus();
  return {
    host: 'local',
    arch: arch() === 'arm64' ? 'arm64' : 'x86_64',
    cpu: { name: cpu[0]?.model ?? 'unknown', cores: cpu.length, coreClasses: ['unknown'] },
    memoryBytes: totalmem(),
    gpu: { name: 'none', count: 0, precisions: [] },
    devices: ['cpu'],
    tools: { workloads: workloadsRevision(workloadsDir) },
    threads: cpu.length,
    counters: { unsupported: ['*'], reason: 'the Kiln server reads no hardware counters' },
    synthetic: false,
  };
}
