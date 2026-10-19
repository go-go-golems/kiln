import type { OptionItem } from './params';
import type { Binding } from './refs';

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
  parent?: string;
  detail?: string;
  props?: Record<string, unknown>;
  hash?: string;
  status?: 'cached' | 'execute' | 'import' | 'blocked' | 'skipped';
  binding?: Binding;
  phase?: 'plan' | 'data' | 'view' | 'handler' | 'effect';
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
  node?: string;
}

export interface ParamSummary {
  key: string;
  urlKey: string;
  name: string;
  scope: 'lab' | 'experiment' | 'board';
  owner: string;
  control: string;
  label: string;
  help?: string;
  unit?: string;
  group?: string;
  order: number;
  defaultValue: unknown;
  /** Literal or plan-resolved options; null when computed at data/view time. */
  options: OptionItem[] | null;
  optionsPhase: 'literal' | 'plan' | 'data' | 'view' | 'runs' | 'none';
  constraints: { min?: number; max?: number; step?: number; scale?: string; pattern?: string; maxLength?: number; placeholder?: string; runPattern?: string };
  binding: Binding;
  readers: string[];
  confirm?: string;
  affects?: Binding;
  urlEnabled: boolean;
}

export interface BoardSummary {
  id: string;
  index: number;
  title: string;
  subtitle?: string;
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
  blockedOn?: string;
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
  question?: string;
  host: string;
  boundary?: string;
  workload: string;
  arms: { name: string; rev: string; role: string; skipped?: string; cell?: Record<string, unknown> }[];
  captures: string[];
  limitations: string[];
  forkOf?: string;
  purpose?: string;
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
  line?: number;
  column?: number;
  stack?: string;
}
