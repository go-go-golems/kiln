// The execution core's nouns (KILN-003 guide §11): hosts and their environments, the facts a probe reports, the
// capability document derived from them, captures, plans and their steps, and what an imported step yields.
// Types only; every module of the package builds on these.

// ── hosts (guide §13.1) ───────────────────────────────────────────────────────────────────────────────────────────

export interface DockerOptions {
  /** `--gpus`: 'all' (the default), 'device=<uuid>', or 'none' for a CPU environment */
  gpus: string;
  /** `--network`: 'none' unless a workload needs one */
  network: string;
  memory: string | null;
  shmSize: string | null;
}

export interface Threads {
  omp?: number;
  mkl?: number;
  openblas?: number;
  inductorCompile?: number;
}

export interface EnvironmentProfile {
  /** An image reference on the host, e.g. 'kiln-perf:latest'; the probe resolves it to an image id */
  image: string;
  /** The interpreter inside the image (default python3) */
  python: string;
  docker: DockerOptions;
  threads: Threads | null;
}

/** A host directory mounted read-only at its own path to provide a tool an image lacks (guide §14.3). */
export interface ToolMount {
  mount: string;
  /** The tool's executable below `mount` */
  bin: string;
}

export interface HostProfile {
  id: string;
  /** Where the host's driver listens, e.g. http://127.0.0.1:5281 */
  url: string;
  environments: Record<string, EnvironmentProfile>;
  toolMounts: Record<string, ToolMount>;
  lock: { waitSeconds: number };
  idleWindowSeconds: number;
  /** nvidia-smi index of the GPU this host's captures use */
  gpu: number;
}

// ── facts (guide §15) ─────────────────────────────────────────────────────────────────────────────────────────────

export interface ProbeResult {
  ok: boolean;
  version?: string | null;
  text?: string;
  error?: string;
  /** tools: the executable that ran, and where it came from ('image' or 'mount:<dir>') */
  bin?: string;
  from?: string;
}

export interface EnvironmentFacts {
  imageRef: string;
  /** The image id (sha256:…), or null when the image is not on the host */
  image: string | null;
  created?: string | null;
  ok: boolean;
  error?: string;
  python?: string;
  gpuVisible?: boolean;
  gpuError?: string;
  commands?: Record<string, ProbeResult>;
  modules?: Record<string, ProbeResult>;
  tools?: Record<string, ProbeResult>;
}

export interface GpuFact {
  index: number;
  name: string;
  uuid: string;
  driver: string;
  cc: string;
  memMiB: number | null;
  maxSmClockMHz: number | null;
  persistence: string;
}

export type GpuCounters = 'admin-only' | 'all-users' | 'unknown';

export interface Facts {
  format: 'kiln-facts/1';
  probedAt: string;
  driver: { api: string; sha256: string };
  host: { hostname: string; kernel: string; arch: string; cpu: { model: string | null; cores: number | null }; memBytes: number | null; freeDiskBytes: number; docker: string | null; uid: number };
  gpus: GpuFact[];
  gpuError?: string;
  gpuCounters: GpuCounters;
  environments: Record<string, EnvironmentFacts>;
  conditions: { computeApps: { pid: number; name: string; usedMiB: number | null }[]; containers: string[] };
}

/** What a probe should check in one environment (kiln-probe-request/1). */
export interface ProbeEnvironmentRequest {
  image: string;
  python: string;
  docker: DockerOptions;
  commands: Record<string, string[]>;
  modules: string[];
  tools: Record<string, { argv: string[]; from: string }[]>;
  mounts: string[];
}

export interface ProbeRequest {
  format: 'kiln-probe-request/1';
  environments: Record<string, ProbeEnvironmentRequest>;
}

// ── requirements and offers (guide §16-18) ────────────────────────────────────────────────────────────────────────

export type Requirement =
  | { gpu: 'cuda' }
  | { command: string }
  | { module: string }
  | { tool: string }
  | { gpuCounters: true }
  | { environment: string };

export type Verdict = { ok: true } | { ok: false; reason: string };

export type KindOffer = { environment: string } | { blocked: string };
export type CollectorOffer = { kinds: string[] } | { blocked: string };

export interface Offers {
  kinds: Record<string, KindOffer>;
  collectors: Record<string, CollectorOffer>;
}

/** kiln-capabilities/1: a probe's facts plus the offers derived from them (guide §17). */
export interface Capabilities {
  format: 'kiln-capabilities/1';
  host: string;
  probedAt: string;
  facts: Facts;
  offers: Offers;
}

// ── captures and plans (guide §19, §21, §22) ──────────────────────────────────────────────────────────────────────

export interface Protocol {
  /** Repetitions: runs of each capture */
  reps: number;
  /** Timed launches per kernel per repetition (kinds that launch kernels) */
  launches: number;
  warmup: number;
  seed: number;
}

/** What a client asks for (POST /api/jobs captures[]). */
export interface CaptureRequest {
  kind: string;
  /** Captures sharing a pairId (and kind and collector set) are one group: ordered together in every repetition. Default: the job */
  pairId?: string;
  /** A named collector set (timing, counters, timeline, memory); `collectors` overrides it */
  mode?: string;
  collectors?: string[];
  input: unknown;
  /** Run even when the capture's identity already has runs (Measure, Compare, Sweep, Tune) */
  rerun?: boolean;
}

/** The software a capture ran in (guide §21.2): part of its identity. */
export interface EnvironmentBlock {
  name: string;
  image: string;
  docker: DockerOptions;
  threads: Threads | null;
  /** Tools the capture's collectors use that are mounted from the host, with their version */
  tools: Record<string, { version: string | null; from: string }>;
  driver: string | null;
}

export interface Capture {
  /** sha256 of kiln-capture/1 (identity.ts) */
  id: string;
  kind: string;
  pairId: string;
  mode: string;
  /** Sorted collector ids */
  collectors: string[];
  input: unknown;
  contentId: string;
  /** For people: what this capture is (a kernel's name and row, an arm) */
  label: string;
  /** CUDA entry symbols the capture launches, for collectors that see kernels by name (ncu, nsys) */
  symbols: string[];
  protocol: Protocol;
  device: string;
  environment: EnvironmentBlock;
  rerun: boolean;
  /** Added by the planner (a counters capture needs a timing companion, guide §20.3) */
  companion?: true;
}

export interface CaptureGroup {
  key: string;
  kind: string;
  collectors: string[];
  pairId: string;
  environment: string;
  protocol: Protocol;
  captures: Capture[];
}

export interface Mount {
  role: 'bundle' | 'cache' | 'tool';
  source: string;
  target: string;
  ro: boolean;
}

export interface Step {
  /** '<group>-r<rep>-<n>', [a-z0-9][a-z0-9-]{0,63} */
  id: string;
  serves: { capture: string; rep: number }[];
  /** A name from plan.environments */
  environment: string;
  argv: string[];
  /** Collector prefixes, outermost first */
  wrap: string[];
  /** A second process after argv, same environment (nsys export) */
  post?: string[];
  env: Record<string, string>;
  mounts: Mount[];
  user: 'host-user' | 'root';
  sidecars: string[];
  timeoutSeconds: number;
  maxOutputBytes: number;
  /** The kind and collectors that made the step: the importers to run on its output */
  kind: string;
  collectors: string[];
}

export interface PlanEnvironment {
  image: string;
  ref: string;
  python: string;
  docker: DockerOptions;
  env: Record<string, string>;
}

export interface StagedFile {
  path: string;
  sha256: string;
}

/** kiln-plan/1 (guide §22.3): what the driver runs. */
export interface Plan {
  format: 'kiln-plan/1';
  job: string;
  host: string;
  driver: { sha256: string };
  environments: Record<string, PlanEnvironment>;
  gpu: { index: number; uuid: string } | null;
  lock: { waitSeconds: number } | null;
  idleWindowSeconds: number;
  limits: { archiveBytes: number; minFreeDiskBytes: number };
  files: StagedFile[];
  steps: Step[];
}

// ── driver events and import (guide §22.6, §23) ───────────────────────────────────────────────────────────────────

export interface DriverEvent {
  seq: number;
  at: string;
  type: string;
  [k: string]: unknown;
}

export interface StepExecution {
  id: string;
  startedAt?: string;
  finishedAt?: string;
  exit?: number | null;
  timedOut?: boolean;
  seconds?: number;
  outputBytes?: number;
  refused?: string;
  postExit?: number | null;
  dropped?: string[];
}

/** One step's files from the archive: `out/<step>/…` keyed by the path below the step's directory, and its log. */
export interface StepOutput {
  step: Step;
  execution: StepExecution | null;
  files: ReadonlyMap<string, Uint8Array>;
  log: string;
}

/** What an importer reads from one step, attributed to a capture's repetition. */
export type Observation =
  | {
      type: 'kernel-launches';
      capture: string;
      rep: number;
      /** Per-launch times, µs */
      us: number[];
      /** The capture's place in its step's order */
      position: number;
      /** Output values at the sampled indices */
      samples: number[];
      regs: number | null;
      /** The runner's device report */
      device: Record<string, unknown>;
      runner: string | null;
    }
  | { type: 'kernel-counters'; capture: string; rep: number; counters: Record<string, number>; clock: 'base' | 'boost' }
  | { type: 'program'; capture: string; rep: number; us: number[]; usBracketed: number[]; kernels: { name: string; identity: string; us: number[] }[]; device: Record<string, unknown> }
  | { type: 'device-spec'; capture: string; rep: number; spec: Record<string, unknown> }
  | {
      type: 'entities';
      capture: string;
      rep: number;
      entities: Record<string, unknown>[];
      links: { from: string; to: string; rel: string; evidence: string; method?: string }[];
      /** Fields of the run entity the importer knows (a lab workload's manifest, activation, quality, validity) */
      run?: Record<string, unknown>;
    }
  | { type: 'error'; capture: string; rep: number; message: string; device?: Record<string, unknown> };
