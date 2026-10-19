import type { OptionItem } from './params.ts';
import type { Binding } from './refs.ts';

export type NodeKind =
  | 'lab'
  | 'experiment'
  | 'arm'
  | 'capture'
  | 'import'
  | 'derive'
  | 'param'
  | 'signal'
  | 'lambda'
  | 'board'
  | 'view'
  | 'hypothesis'
  | 'compare';

export type EdgeKind = 'contains' | 'input' | 'reads' | 'produces' | 'evidence' | 'binds';

export interface IRNode {
  id: string;
  kind: NodeKind;
  label: string;
  parent?: string | undefined;
  detail?: string | undefined;
  props?: Record<string, unknown> | undefined;
  hash?: string | undefined;
  status?: 'cached' | 'execute' | 'import' | 'blocked' | 'skipped' | undefined;
  binding?: Binding | undefined;
  phase?: 'plan' | 'data' | 'view' | 'handler' | 'effect' | undefined;
}

export interface IREdge {
  from: string;
  to: string;
  kind: EdgeKind;
}

export interface PassRecord {
  n: number;
  name: string;
  detail: string;
  ms: number;
}

export interface LintItem {
  level: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  node?: string | undefined;
}

export interface ParamSummary {
  key: string;
  urlKey: string;
  name: string;
  scope: 'lab' | 'experiment' | 'board';
  owner: string;
  control: string;
  label: string;
  help?: string | undefined;
  unit?: string | undefined;
  group?: string | undefined;
  order: number;
  defaultValue: unknown;
  /** Literal or plan-resolved options; null when computed at data/view time. */
  options: OptionItem[] | null;
  optionsPhase: 'literal' | 'plan' | 'data' | 'view' | 'runs' | 'none';
  constraints: { min?: number | undefined; max?: number | undefined; step?: number | undefined; scale?: string | undefined; pattern?: string | undefined; maxLength?: number | undefined; placeholder?: string | undefined; runPattern?: string | undefined };
  binding: Binding;
  readers: string[];
  confirm?: string | undefined;
  affects?: Binding | undefined;
  urlEnabled: boolean;
}

export interface BoardSummary {
  id: string;
  index: number;
  title: string;
  subtitle?: string | undefined;
  viewKinds: string[];
  paramKeys: string[];
  presets: { name: string; values: Record<string, unknown> }[];
  experiments: string[];
  signals: number;
}

export interface CaptureSummary {
  id: string;
  experiment: string;
  arm: string;
  mode: string;
  ref: string;
  reps: number;
  hash: string;
  status: 'cached' | 'execute' | 'import' | 'blocked';
  stage: number;
  blockedOn?: string | undefined;
  estimateGpuMin: number;
  host: string;
  lowered: Record<string, unknown>;
}

export interface PlanSummary {
  stages: { stage: number; label: string; captures: string[] }[];
  captures: CaptureSummary[];
  execute: number;
  /** captures an approved job will read from a registered evidence archive */
  import: number;
  cached: number;
  blocked: number;
  estimateGpuMin: number;
}

export interface ExperimentSummary {
  id: string;
  question?: string | undefined;
  host: string;
  boundary?: string | undefined;
  workload: string;
  arms: { name: string; rev: string; role: string; skipped?: string | undefined; cell?: Record<string, unknown> | undefined }[];
  captures: string[];
  limitations: string[];
  forkOf?: string | undefined;
  purpose?: string | undefined;
}

export interface IR {
  buildId: string;
  version: number;
  labId: string;
  title: string;
  nodes: IRNode[];
  edges: IREdge[];
  passes: PassRecord[];
  lint: LintItem[];
  boards: BoardSummary[];
  params: ParamSummary[];
  plan: PlanSummary;
  experiments: ExperimentSummary[];
  hypotheses: { id: string; claim: string }[];
  stats: Record<string, number>;
  durationMs: number;
}

export interface BuildFailure {
  message: string;
  line?: number | undefined;
  column?: number | undefined;
  stack?: string | undefined;
}
