// Shared by the scripts that read Perf Lab's store (check-pl.ts, extract-fixtures.ts). Never imported by tests.
import { existsSync } from 'node:fs';
import { arch, cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import type { HostReport } from '../src/index.ts';
import { readPerfLabStore, type PerfLabStore } from '../src/node/index.ts';

/** Perf Lab's store as received (lab-workbench/.data), opened read-only; KILN_PL_DB overrides the path. */
export const PL_DB = process.env.KILN_PL_DB ?? fileURLToPath(new URL('../../../lab-workbench/.data/perf-lab.sqlite', import.meta.url));

/**
 * Host `local`'s probe report. Perf Lab's server probes the machine when it starts and never stores the report, so
 * it is reconstructed: the one field capture identity depends on, `tools.workloads` (the content hash of the workload
 * sources, which each local sampler arm's revision is), is read back from the measured local sampler artifacts' specs
 * (`comparison.arm_revision`); the rest describes this machine and matches what the probe reports on a CPU-only Mac
 * (no GPU, no hardware counters).
 */
export function reconstructLocalReport(store: PerfLabStore): HostReport {
  // local-sampler.lab.js names each arm `rev(ctx.capabilities.tools.workloads)`; other local programs (dino-local) pin git revisions
  const revisions = [...new Set(store.measured.filter((m) => m.host === 'local' && m.adapter === 'sampler' && m.armRevision).map((m) => m.armRevision!))];
  if (revisions.length !== 1) throw new Error(`expected one workload revision among the measured local sampler artifacts, found ${revisions.length}: ${revisions.join(', ')}`);
  const cpu = cpus();
  return {
    host: 'local',
    arch: arch() === 'arm64' ? 'arm64' : 'x86_64',
    cpu: { name: cpu[0]?.model ?? 'unknown', cores: cpu.length, coreClasses: ['performance', 'efficiency'] },
    memoryBytes: null,
    gpu: { name: 'none', count: 0, precisions: [] },
    devices: ['cpu'],
    tools: { workloads: revisions[0]! },
    threads: cpu.length,
    counters: { unsupported: ['*'], reason: 'no hardware counters on this host' },
    synthetic: false,
  };
}

/** Read the store twice: once to learn the workload revision, once with the reconstructed local report. */
export function openPerfLab(): { store: PerfLabStore; local: HostReport } {
  if (!existsSync(PL_DB)) throw new Error(`Perf Lab's store not found at ${PL_DB} (set KILN_PL_DB)`);
  const local = reconstructLocalReport(readPerfLabStore(PL_DB));
  return { store: readPerfLabStore(PL_DB, { localReport: local }), local };
}
