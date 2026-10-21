// The collectors (guide §20.2) and the modes that name sets of them (§20.3).
import type { Collector, WorkloadKind } from '../registry.ts';
import { gpuSampler } from './gpu-sampler.ts';
import { ncu } from './ncu.ts';
import { nsys } from './nsys.ts';

const inProcess = (id: string, title: string, requires: Collector['requires'], env: Record<string, string> = {}, disturbs: Collector['disturbs'] = []): Collector => ({
  id, title, shape: 'in-process', requires, disturbs,
  apply: (step) => ({ ...step, env: { ...step.env, ...env } }),
});

export const cudaEvents = inProcess('cuda-events', 'CUDA event timing', [{ gpu: 'cuda' }]);
export const ptxas = inProcess('ptxas', 'ptxas register counts', [{ command: 'nvcc' }]);
export const nvtx = inProcess('nvtx', 'NVTX ranges', [], { KILN_COLLECT_NVTX: '1' });
export const stageTimers = inProcess('stage-timers', 'stage timers in the log', []);
// a Python workload's own instruments (perf-lab-sampler/1): the entry point reads which are on from its spec
export const wallClock = inProcess('wall-clock', 'per-request wall and thread CPU time (perf_counter_ns)', []);
export const rusage = inProcess('rusage', 'process resource usage over the measured window (getrusage)', []);
export const torchProfiler = inProcess('torch-profiler', 'torch.profiler CPU trace: requests, ranges, ATen operators', [{ module: 'torch' }], {}, ['latency']);
export const torchMemory = inProcess('torch-memory', 'torch.profiler allocator events and the tensor ledger', [{ module: 'torch' }], {}, ['latency', 'memory']);

export const COLLECTORS: readonly Collector[] = [cudaEvents, ptxas, nvtx, stageTimers, wallClock, rusage, torchProfiler, torchMemory, ncu, nsys, gpuSampler];
export const collectorById = new Map(COLLECTORS.map((c) => [c.id, c]));

/**
 * Named collector sets. A capture's identity holds its set, not the name. A mode keeps only the collectors a kind
 * supports, so `timing` is CUDA events for kiln-kernels/1 and the wall clock for perf-lab-sampler/1; `cpu`, `trace`
 * and `memory` are Perf Lab's modes of its local workload.
 */
export const MODES: Record<string, readonly string[]> = {
  timing: ['cuda-events', 'ptxas', 'stage-timers', 'wall-clock', 'gpu-sampler'],
  counters: ['ncu', 'gpu-sampler'],
  timeline: ['nsys', 'nvtx', 'gpu-sampler'],
  cpu: ['wall-clock', 'rusage'],
  trace: ['torch-profiler'],
  memory: ['torch-profiler', 'torch-memory'],
};

/** Whether a kind can use a collector at all: wrappers and sidecars always, in-process ones only when the kind lists them. */
export const supports = (kind: WorkloadKind, c: Collector): boolean => c.shape !== 'in-process' || kind.inProcess.includes(c.id);

/** A mode's collectors for a kind, sorted; unknown mode → null. */
export function modeCollectors(kind: WorkloadKind, mode: string): string[] | null {
  const ids = MODES[mode];
  if (!ids) return null;
  const out = ids.filter((id) => {
    const c = collectorById.get(id);
    return c !== undefined && supports(kind, c);
  }).sort();
  return out.some((id) => !collectorById.get(id)!.optional) ? out : null;
}

/** The mode a collector set corresponds to, for people: 'timing', 'counters', 'timeline', or 'custom'. */
export function modeOf(kind: WorkloadKind, collectors: readonly string[]): string {
  const essential = (ids: readonly string[]) => ids.filter((id) => !collectorById.get(id)?.optional).sort().join(',');
  const key = essential(collectors);
  for (const m of Object.keys(MODES)) {
    const ids = modeCollectors(kind, m);
    if (ids && essential(ids) === key) return m;
  }
  return 'custom';
}

/** Does any collector of the set disturb this quantity? */
export const disturbs = (collectors: readonly string[], q: 'latency' | 'throughput' | 'memory'): boolean =>
  collectors.some((id) => collectorById.get(id)?.disturbs.includes(q));
