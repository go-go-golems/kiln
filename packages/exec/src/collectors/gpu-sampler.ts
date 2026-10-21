// gpu-sampler (guide §20.7): the driver runs nvidia-smi on the host for the duration of a step and writes
// out/<step>/gpu.csv; the series becomes `sample` entities on the conditions:gpu lane of every run the step served.
import type { Observation } from '../model.ts';
import type { Collector } from '../registry.ts';

const FIELDS = ['timestamp', 'utilizationPct', 'smClockMHz', 'memClockMHz', 'memoryUsedMiB', 'powerW', 'temperatureC'] as const;

/** nvidia-smi's "2026/10/20 14:02:11.123" (local time of the host) as milliseconds since the epoch, read as UTC. */
const smiTime = (s: string): number => Date.parse(s.trim().replace(/^(\d{4})\/(\d{2})\/(\d{2}) /, '$1-$2-$3T') + 'Z');

export function parseGpuCsv(text: string): Record<string, number>[] {
  const rows: Record<string, number>[] = [];
  for (const line of text.split('\n')) {
    const v = line.split(',').map((x) => x.trim());
    if (v.length !== FIELDS.length) continue;
    const t = smiTime(v[0]!);
    if (!Number.isFinite(t)) continue;
    const row: Record<string, number> = { t };
    FIELDS.slice(1).forEach((f, i) => {
      const n = Number(v[i + 1]);
      if (Number.isFinite(n)) row[f] = n;
    });
    rows.push(row);
  }
  return rows;
}

export const gpuSampler: Collector = {
  id: 'gpu-sampler', title: 'GPU utilisation, clocks and power (nvidia-smi, 100 ms)', shape: 'sidecar', requires: [{ gpu: 'cuda' }], disturbs: [], optional: true,
  apply: (step) => ({ ...step, sidecars: [...new Set([...step.sidecars, 'gpu-sampler'])] }),
  import(out) {
    const data = out.files.get('gpu.csv');
    if (!data) return [];
    const rows = parseGpuCsv(new TextDecoder().decode(data));
    if (!rows.length) return [];
    const t0 = rows[0]!.t!;
    const entities = rows.map((r, i) => ({ kind: 'sample', id: `gpu-${String(i).padStart(5, '0')}`, lane: 'conditions:gpu', start: (r.t! - t0) * 1e6, end: (r.t! - t0) * 1e6, dur: 0, ...r }));
    return out.step.serves.map((s): Observation => ({ type: 'entities', capture: s.capture, rep: s.rep, entities, links: [] }));
  },
};
