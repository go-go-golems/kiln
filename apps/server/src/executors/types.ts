// What the server sends a CUDA runner and what comes back (kiln-bundle/1 and kiln-results/1, the formats of
// runner/kiln_runner.py and K/src/std/devices.js), and the interface every executor implements (guide §30.5).

/** One kernel as the runner compiles and runs it. */
export interface BundleKernel {
  name: string;
  identity: string;
  row: string;
  /** CUDA C++ with one __global__ function */
  source: string;
  grid: number;
  block: number;
  smem: number;
  /** Element count and generator seed of each input */
  inputs: { size: number; seed: number }[];
  /** Element count of the output */
  out: number;
  /** Output indices whose values the runner returns */
  samples: number[];
}

/** One runner invocation: every kernel once, `reps` timed launches after `warmup` (one protocol repetition). */
export interface KilnBundle {
  format: 'kiln-bundle/1';
  reps: number;
  warmup: number;
  ncu: boolean;
  kernels: BundleKernel[];
}

/** The runner's device report (`kiln_runner.py device`): flat fields, or `error`. */
export type DeviceReport = Record<string, unknown> & { name?: string; error?: string };

export interface KernelResult {
  name: string;
  identity?: string | null;
  us_median?: number;
  us_min?: number;
  /** Every timed launch, µs */
  us_all?: number[];
  /** Output values at the bundle's sample indices (non-finite values are reported as 1e30) */
  samples?: number[];
  regs?: number | null;
  ncu?: Record<string, number | string>;
  error?: string;
}

export interface KilnResults {
  format: 'kiln-results/1';
  device: DeviceReport;
  /** One per bundle kernel, in bundle order */
  kernels: KernelResult[];
  /** The runner's version, e.g. "kiln_runner/2" */
  runner?: string;
  created?: string;
}

export interface Executor {
  /** 'local-cuda', 'rtx-dev', … */
  readonly id: string;
  readonly target: 'local' | 'ssh';
  /** The host as it enters the device fingerprint: the SSH destination, or this machine's host name */
  readonly host: string;
  /** The runner's device report; rejects when the runner cannot report one */
  probe(signal?: AbortSignal): Promise<DeviceReport>;
  /** Run one repetition. `onLine` receives the runner's progress lines (stderr). Rejects when `signal` aborts. */
  runRepetition(bundle: KilnBundle, signal: AbortSignal, onLine?: (line: string) => void): Promise<KilnResults>;
}
