// @kiln/lab: Perf Lab's lab-program language (lab.js), headless. Values, statistics and verdicts are @kiln/evidence's;
// data access is injected (LabData). Browser-safe: nothing here imports Node modules. The Node-only reader of Perf
// Lab's SQLite store and the preset files is `@kiln/lab/node`.

// ── building a program ─────────────────────────────────────────────────────────
export { build, BuildError, evaluateProgram, paramSpecOf, selectImages, type BuildInput, type BuildOutput, type ImageSelection, type Patch } from './lang/build.ts';
export { createLibrary, capture, component, defineCollector, defineKind, type KindDef, type Library } from './lang/library.ts';
export type {
  BoardSummary,
  BuildFailure,
  CaptureSummary,
  EdgeKind,
  ExperimentSummary,
  IR,
  IREdge,
  IRNode,
  LintItem,
  NodeKind,
  ParamSummary,
  PassRecord,
  PlanSummary,
} from './lang/ir.ts';
export type { AdapterContract, BuildEnv, Capabilities, CaptureInstance, DatasetInfo } from './lang/env.ts';

// ── builders (what a program's calls record) ───────────────────────────────────
export {
  ArmB,
  BoardB,
  CaptureB,
  ExperimentB,
  HypothesisB,
  LabB,
  PhasesB,
  SubRecorder,
  ViewB,
  CAPTURE_METHODS,
  VIEW_METHODS,
  isLab,
  isView,
  recorder,
  toView,
  type CallLog,
  type CollectorDef,
  type DeriveDecl,
  type ParamSlot,
  type PhaseDecl,
  type Rec,
  type WhenDecl,
} from './lang/builders.ts';
export { algo, isAlgo, walkthrough, type AlgoSpec, type WCell, type WGroup, type WStep, type Walkthrough } from './lang/algo.ts';
export { by, compare, isCompare, CompareB, MatcherB, type ComparePair, type CompareResult } from './lang/compare.ts';

// ── parameters, signals and live lambdas ───────────────────────────────────────
export {
  ParamSpec,
  checkParam,
  decodeParam,
  encodeParam,
  formatParam,
  implicitDefault,
  isParamSpec,
  literalOptions,
  normalizeOptions,
  paramKinds,
  type Check as ParamCheck,
  type ControlKind,
  type OptionItem,
  type OptionValue,
  type ParamConstraints,
  type ParamModifiers,
} from './lang/params.ts';
export {
  BINDING_RANK,
  isFn,
  isLive,
  isParamRef,
  isSignalRef,
  live,
  strongest,
  type Binding,
  type Dollar,
  type LiveFn,
  type ParamRef,
  type Phase,
  type SignalRef,
} from './lang/refs.ts';

// ── data time: queries, rows, entities, the runtime ────────────────────────────
export { Query, isQuery, q, type QueryEnv, type QueryOp, type QueryRoot } from './lang/query.ts';
export { AggRows, FIELD_UNITS, Grouped, Rows, isEnt, makeEnt, rows, type DataSource, type Ent, type EntityKind, type Link, type RawEnt } from './lang/rows.ts';
export {
  dehydrate,
  evaluateInput,
  instancesForPattern,
  makeDollar,
  materialize,
  paramRuntime,
  paramValue,
  patternExperiments,
  queryEnv,
  readDerive,
  rehydrate,
  resolveValue,
  runsMatching,
  signalValue,
  type BuildRegistry,
  type DollarOptions,
  type ParamRuntime,
  type ResolvedArm,
  type ResolvedExperiment,
  type RuntimeState,
  type Tracker,
} from './lang/runtime.ts';

// ── evidence: values, estimators, verdicts ─────────────────────────────────────
export {
  combine,
  computed,
  defined,
  derived,
  fieldsOf,
  heuristic,
  illustrative,
  isMissing,
  isSealed,
  isValue,
  missing,
  num,
  observed,
  provOf,
  ProvenanceError,
  raw,
  revive,
  seal,
  valueFrom,
  withValue,
  type LinkEvidence,
  type Prov,
  type Value,
  type ValueFields,
  type ValueOpts,
} from './lang/values.ts';
export { stats, type PairedRatioOpts, type PairedRatioResult } from './lang/stats.ts';
export { evaluateHypotheses, evaluateHypothesis, type HypothesisResult, type HypothesisSupport, type Verdict } from './lang/hypothesis.ts';
export { below, above, verdict, type Check, type SupportRecord, type VerdictResult } from '@kiln/evidence';

// ── detection comparison (PR 1005's quality semantics) ─────────────────────────
export {
  cocoBox,
  compareDetections,
  compareGroundTruth,
  evaluateDetections,
  maximumMatching,
  ordered,
  overlap,
  pairDetections,
  verdicts as detectionVerdicts,
  type Box,
  type CompareResult as DetectionCompareResult,
  type Detection,
  type DetectionStatus,
  type Evaluation,
  type GroundTruth,
  type Pairing,
} from './lang/detections.ts';

// ── helpers ────────────────────────────────────────────────────────────────────
export { clamp, fmtBytes, fmtNumber, getPath, globToRegExp, hash, nextId, rng, seedFrom, stableStringify, type Rng } from './lang/util.ts';

// ── data: environments, the injected data interface, synthetic runs ────────────
export { buildSynthetic, labEnv, syntheticEnv, type SyntheticBuildOptions, type SyntheticEnvOptions } from './data/env.ts';
export { bundlesNeeded, createMemoryLabData, type CatalogEntry, type LabData, type MemoryLabData, type MemoryLabDataInit } from './data/lab-data.ts';
export { reviveBundles, type BundleJSON, type RunBundle } from './data/bundles.ts';
export { KNOWN_HOSTS, adapter, capabilities, capabilitiesFor, knownHosts, type LocalReport } from './data/capabilities.ts';
export {
  EVIDENCE_IMPORT_FEATURE,
  datasetProvider,
  datasetRefPrefix,
  defaultMediaUrl,
  evidenceBlockedBy,
  indexDataset,
  type ArchiveInfo,
  type DatasetAnnotation,
  type DatasetDetail,
  type DatasetEntities,
  type DatasetImage,
} from './data/datasets.ts';
export { createSource, createSyntheticSource, generatedRun, syntheticRuns, type DatasetProvider, type RunProvider } from './data/source.ts';
export { generateRun, syntheticMissing, type GeneratedRun, type RawEntity } from './data/generate.ts';

// ── example programs ───────────────────────────────────────────────────────────
export { PRESET_INFO, presetInfo, type Preset, type PresetGroup, type PresetInfo } from './presets.ts';
