// Workload kinds and collectors (guide §19, §20): the two registries every capture goes through. A kind knows one
// kind of code; a collector knows one way of observing a run. Neither knows hosts, the driver or the database.
import type { MeasurementRecord } from '@kiln/evidence';
import type { Capture, CaptureGroup, EnvironmentBlock, Facts, HostProfile, Mount, Observation, Requirement, Step, StepOutput } from './model.ts';

export type Quantity = 'latency' | 'throughput' | 'memory';

/** A refusal while accepting a capture's input: 400 for a malformed input, 409 when its content id does not match. */
export interface Refusal {
  status: 400 | 409;
  error: string;
  message: string;
  extra?: Record<string, unknown>;
}

export interface AcceptContext {
  asset(name: string): Uint8Array;
}

export type Accepted<I> = { ok: true; input: I; contentId: string; label: string; symbols: string[] } | ({ ok: false } & Refusal);

export interface PlanContext {
  job: string;
  kind: WorkloadKind;
  host: HostProfile;
  facts: Facts;
  /** The environment the group runs in (a name of the host profile) */
  environment: string;
  /** Files the server provides by name (runner scripts): their bytes */
  asset(name: string): Uint8Array;
  /** Puts a file into the job bundle; returns its path inside a step (/job/in/<path>) */
  stage(path: string, bytes: Uint8Array): string;
  /** The tool binary a collector uses in this environment, and the host directory to mount for it */
  tool(name: string): { bin: string; mount: string | null } | null;
}

/** A step as a kind lowers it; the planner adds its id, environment, collectors and sidecars. */
export interface StepDraft {
  serves: { capture: string; rep: number }[];
  argv: string[];
  env?: Record<string, string>;
  mounts?: Mount[];
  user?: 'host-user' | 'root';
  timeoutSeconds: number;
  maxOutputBytes?: number;
}

export interface ImportContext {
  job: string;
  /** Captures of the job by id */
  captures: ReadonlyMap<string, Capture>;
  /** Reads an nsys SQLite export (the server's node:sqlite); null where unavailable */
  readNsys?: (bytes: Uint8Array) => NsysTables | null;
}

/** The tables of an `nsys export --type sqlite` the nsys collector reads (guide §20.5). */
export interface NsysTables {
  kernels: { start: number; end: number; deviceId: number; streamId: number; name: string; correlationId: number; grid: [number, number, number]; block: [number, number, number]; registers: number }[];
  copies: { start: number; end: number; bytes: number; copyKind: number; deviceId: number; streamId: number }[];
  ranges: { start: number; end: number | null; text: string; tid: number }[];
  calls: { start: number; end: number; name: string; correlationId: number; tid: number }[];
}

/** What a kind's finish hook sees: the job's captures of that kind with their observations, and how the job ended. */
export interface FinishContext {
  job: string;
  host: string;
  hostname: string;
  status: 'done' | 'failed' | 'cancelled';
  error: string | null;
  archive: string | null;
  app: string;
  at: string;
  captures: Capture[];
  observations: Observation[];
  /** Repetitions of each capture whose step ran (exit status known), by capture id */
  completed: ReadonlyMap<string, number>;
}

export interface WorkloadKind<I = unknown> {
  readonly id: string;
  readonly title: string;
  /** Preferred environment names, tried first (guide §18) */
  readonly environments: readonly string[];
  readonly requires: readonly Requirement[];
  /** In-process collectors this kind's entry point cooperates with */
  readonly inProcess: readonly string[];
  /** Assets (server files) the kind stages, by name */
  readonly assets: readonly string[];
  /** The NVTX range around the timed work, when the entry point emits one (nsys captures only that range) */
  readonly nvtxRange?: string;
  /** Checks a capture's input and recomputes its content id; `at` prefixes messages. A kind whose code is staged
   * from server files (its assets) puts their bytes into the content id through `ctx.asset`. */
  accept(input: unknown, at: string, ctx: AcceptContext): Accepted<I>;
  /** The group's steps for one repetition, captures in ctx order */
  lower(group: CaptureGroup, rep: number, ctx: PlanContext, order: number[]): StepDraft[];
  /** Observations from one step's output */
  import(out: StepOutput, ctx: ImportContext): Observation[];
  /** Records projected from the job's runs of this kind (guide §23.3) */
  finish?(ctx: FinishContext): MeasurementRecord[];
  /** For kinds a lab program lowers: the lab's own name for the capture (its lab, spec hash and experiment/arm/mode) */
  lab?(c: Capture): { labId: string; hash: string; ref: string };
}

export interface Collector {
  readonly id: string;
  readonly title: string;
  readonly shape: 'wrapper' | 'in-process' | 'sidecar';
  readonly requires: readonly Requirement[];
  /** Quantities whose samples its runs must not contribute (guide §20.3) */
  readonly disturbs: readonly Quantity[];
  readonly exclusive?: readonly string[];
  readonly hints?: { singleLaunch?: true };
  /** A mode includes it only on hosts that offer it (a sampler of conditions, not a measurement) */
  readonly optional?: true;
  /** Adds the collector to a step: wrap prefix, environment, mounts, a post-step or a sidecar. Pure. */
  apply(step: Step, ctx: PlanContext): Step;
  import?(out: StepOutput, ctx: ImportContext): Observation[];
}

/** The environment block of a capture (guide §21.2): the image id, never a tag; tools only when mounted. */
export function environmentBlock(name: string, host: HostProfile, facts: Facts, collectors: readonly string[]): EnvironmentBlock {
  const p = host.environments[name]!, f = facts.environments[name];
  const tools: EnvironmentBlock['tools'] = {};
  for (const c of collectors) {
    const t = f?.tools?.[c];
    if (t?.ok && t.from && t.from !== 'image') tools[c] = { version: t.version ?? null, from: t.from };
  }
  const gpu = facts.gpus.find((g) => g.index === host.gpu) ?? facts.gpus[0];
  return { name, image: f?.image ?? 'unknown', docker: { ...p.docker }, threads: p.threads ? { ...p.threads } : null, tools, driver: gpu?.driver ?? null };
}
