import type { DataSource } from './rows';

export interface Capabilities {
  host: string;
  arch: 'arm64' | 'x86_64';
  gpu: {
    name: string;
    count: number;
    supports(precision: string): boolean;
    peak(precision: string, level: string): number;
  };
  cpu: { name: string; cores: number; coreClasses: string[] };
  tools: Record<string, string>;
  counters: { unsupported: string[] };
  /** devices a workload may run on; absent for synthetic hosts */
  devices?: string[];
  synthetic: boolean;
}

export interface AdapterContract {
  name: string;
  supports(treatment: string): boolean;
  switchesFor(treatment: string): Record<string, unknown>;
  graphCache?: { capacity: number };
  perRequestMs: number;
}

/** A capture instance after resolve/lower: one experiment × arm × capture mode. */
export interface CaptureInstance {
  id: string;
  experiment: string;
  arm: string;
  armRole: string;
  rev: string;
  mode: string;
  ref: string;
  reps: number;
  hash: string;
  host: string;
  workload: { adapter: string; opts: Record<string, unknown> };
  spec: Record<string, unknown>;
  stage: number;
  status: 'cached' | 'execute' | 'import' | 'blocked';
  blockedOn?: string;
  dependsOn?: string;
  estimateGpuMin: number;
}

/** What a build needs to know about a dataset to resolve an image selection (server: GET /datasets/:id). */
export interface DatasetInfo {
  id: string;
  name: string;
  imageCount: number;
  images: { imageId: number; negative: boolean; present: boolean }[];
  provenance: { strata?: { category: string; size: string; image_ids: number[] }[]; negative_ids?: number[] };
}

/** Everything the language needs from the outside world; synthetic in the prototype. */
export interface BuildEnv {
  capabilities(host: string): Capabilities;
  adapter(name: string): AdapterContract;
  isAvailable(hash: string): boolean;
  makeSource(instances: CaptureInstance[], isAvailable: (hash: string) => boolean): DataSource;
  /** whether the lab server holds an evidence archive with this SHA-256 (absent: no server) */
  archive?(sha256: string): boolean;
  /** a registered dataset by manifest SHA-256 (absent: no server) */
  dataset?(sha256: string): DatasetInfo | undefined;
  /** why no evidence can be imported at all (e.g. a server that predates evidence import), if so */
  evidenceBlocked?(): string | undefined;
}
