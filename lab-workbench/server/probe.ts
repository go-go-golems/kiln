import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ServerConfig } from './config';

const exec = promisify(execFile);

export interface LocalCapabilities {
  host: 'local';
  arch: 'arm64' | 'x86_64';
  cpu: { name: string; cores: number; coreClasses: string[]; performanceCores: number | null; efficiencyCores: number | null };
  memoryBytes: number | null;
  gpu: { name: string; count: number; precisions: string[] };
  devices: string[];
  tools: Record<string, string>;
  threads: number;
  counters: { unsupported: string[]; reason: string };
  synthetic: false;
}

export type ProbeResult = { ok: true; capabilities: LocalCapabilities; ms: number } | { ok: false; error: string; ms: number };

/** Runs the read-only capability probe in the workloads environment. */
export async function probeLocal(config: ServerConfig): Promise<ProbeResult> {
  const t0 = Date.now();
  try {
    const { stdout } = await exec(config.uv, ['run', '--project', config.workloadsDir, 'python', '-m', 'perf_lab_local.probe'], {
      cwd: config.workloadsDir,
      timeout: 180_000,
      maxBuffer: 1 << 20,
    });
    const line = stdout.trim().split('\n').filter((l) => l.startsWith('{')).pop();
    if (!line) throw new Error(`probe printed no JSON: ${stdout.slice(0, 200)}`);
    return { ok: true, capabilities: JSON.parse(line) as LocalCapabilities, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, error: (e as Error).message.slice(0, 500), ms: Date.now() - t0 };
  }
}
