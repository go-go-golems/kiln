import { algo } from './algo.ts';
import {
  CaptureB,
  LabB,
  SubRecorder,
  ViewB,
  toView,
  type CollectorDef,
} from './builders.ts';
import { compare, by } from './compare.ts';
import { paramKinds } from './params.ts';
import { q } from './query.ts';
import { live } from './refs.ts';
import { stats } from './stats.ts';
import { above, below } from '@kiln/evidence';
import { illustrative as illustrativeValue, missing, type Value, type ValueOpts } from './values.ts';

/** `illustrative(value, 'ms')` as in Perf Lab, or with evidence's options object. */
const illustrative = (value: number | string | boolean | null, unitOrOpts?: string | ValueOpts): Value =>
  illustrativeValue(value, typeof unitOrOpts === 'string' ? { unit: unitOrOpts } : (unitOrOpts ?? {}));

const tagged = (k: string, props: Record<string, unknown> = {}) => ({ [`__${k}`]: true, kind: k, ...props });

export const capture = {
  timing: () => new CaptureB('timing'),
  trace: () => new CaptureB('trace'),
  kernels: () => new CaptureB('kernels'),
  memory: () => new CaptureB('memory'),
  cpu: () => new CaptureB('cpu'),
  /** synchronized stage durations of the detector's request path */
  stages: () => new CaptureB('stages'),
  /** full detection records per image and arm */
  predictions: () => new CaptureB('predictions'),
  /** a native test suite's outcomes */
  tests: () => new CaptureB('tests'),
  sanitizer: (tool: string) => {
    const c = new CaptureB('sanitizer');
    c.props.tool = [tool];
    return c;
  },
};

export function defineCollector(name: string, def: CollectorDef) {
  return (props: Record<string, unknown> = {}) =>
    new CaptureB(name, { name, def, props: { ...(def.defaults ?? {}), ...props } });
}

export function component(name: string, fn: (props: Record<string, unknown>) => unknown) {
  const make = (props: Record<string, unknown> = {}) => {
    const v = new ViewB('component', [props]);
    v.componentName = name;
    v.children.push(toView(fn(props)));
    return v;
  };
  return make;
}

export interface KindDef {
  defaults?: Record<string, unknown>;
  describe?: (p: Record<string, unknown>) => string;
  build: (b: { kind: string }, p: Record<string, unknown>) => unknown;
}

export function defineKind(name: string, def: KindDef) {
  return (props: Record<string, unknown> = {}) => {
    const merged = { ...(def.defaults ?? {}), ...props };
    const v = new ViewB(`kind:${name}`, [merged]);
    v.componentName = name;
    const text = def.describe?.(merged);
    if (text !== undefined) v.describeText = text;
    v.children.push(toView(def.build({ kind: name }, merged)));
    return v;
  };
}

function grid(first: unknown, ...rest: unknown[]) {
  if (Array.isArray(first) && 'raw' in first) return { __areas: String.raw(first as unknown as TemplateStringsArray, ...rest) };
  return new ViewB('grid', [first]);
}

const view = (kind: string) => (...args: unknown[]) => new ViewB(kind, args);

const ms = (d: unknown): number => {
  const m = /^([\d.]+)\s*(ms|s|m)?$/.exec(String(d));
  if (!m) return Number(d);
  const n = Number(m[1]);
  return m[2] === 's' ? n * 1000 : m[2] === 'm' ? n * 60000 : n;
};

/** Every free name a lab.js program can use. */
export function createLibrary() {
  return {
    lab: (title: string) => new LabB(title),
    // identity
    rev: (sha: string) => tagged('rev', { sha: String(sha) }),
    fixtures: (id: string) => tagged('fixtures', { id }),
    src: (ref: string) => tagged('src', { ref }),
    /** an evidence archive registered on the lab server, by SHA-256 (pnpm lab evidence add <file>) */
    archive: (sha256: string, opts: { name?: string } = {}) => tagged('archive', { sha256: String(sha256), ...opts }),
    /** a dataset registered on the lab server, by the SHA-256 of its manifest */
    dataset: (sha256: string, opts: { name?: string } = {}) => tagged('dataset', { sha256: String(sha256), ...opts }),
    // workloads
    dino: (opts: Record<string, unknown> = {}) => tagged('workload', { adapter: 'dino', opts }),
    embedding: (opts: Record<string, unknown> = {}) => tagged('workload', { adapter: 'embedding', opts }),
    /** Deformable-attention sampling run for real on the local host (workloads/perf_lab_local). */
    sampler: (opts: Record<string, unknown> = {}) => tagged('workload', { adapter: 'sampler', opts }),
    load: (workload: unknown, schedule: unknown) => tagged('corunner', { name: 'load', workload, schedule }),
    // contract
    activation: (expect: Record<string, unknown>) => tagged('activation', { expect }),
    paired: (opts: Record<string, unknown> = {}) => tagged('order', { type: 'paired', ...opts }),
    quality: {
      ref: (path: string, opts: Record<string, unknown> = {}) => tagged('gate', { path, ...opts }),
      exact: () => tagged('gate', { path: null, mode: 'exact' }),
    },
    stats,
    schedule: {
      poisson: (o: Record<string, unknown>) => tagged('schedule', { type: 'poisson', ...o }),
      constant: (o: Record<string, unknown>) => tagged('schedule', { type: 'constant', ...o }),
    },
    stress: {
      cpuBandwidth: (o: Record<string, unknown> = {}) => tagged('corunner', { name: 'cpu-bandwidth', ...o }),
      cpuCompute: (o: Record<string, unknown> = {}) => tagged('corunner', { name: 'cpu-compute', ...o }),
      gpuCompute: (o: Record<string, unknown> = {}) => tagged('corunner', { name: 'gpu-compute', ...o }),
    },
    none: () => tagged('corunner', { name: 'none' }),
    capture,
    defineCollector,
    ms,
    // evidence
    q,
    compare,
    by,
    live,
    missing,
    illustrative,
    /** three-valued interval tests for predicates (evidence): true, false, or null when `lo..hi` straddles the bound */
    below,
    above,
    // parameters
    ...paramKinds,
    textInput: paramKinds.text,
    // views
    table: view('table'),
    chart: view('chart'),
    timeline: view('timeline'),
    stat: view('stat'),
    manifest: view('manifest'),
    manifestDiff: view('manifestDiff'),
    mirror: view('mirror'),
    metrics: view('metrics'),
    kernelCard: view('kernelCard'),
    ledger: view('ledger'),
    source: view('source'),
    route: view('route'),
    stepper: view('stepper'),
    hypothesisCard: view('hypothesisCard'),
    note: view('note'),
    math: view('math'),
    text: view('text'),
    row: view('row'),
    stack: view('stack'),
    split: view('split'),
    runList: view('runList'),
    /** one image with ground-truth and per-arm detection boxes: detections(dataset, imageId).runs(pattern) */
    detections: view('detections'),
    /** a dataset's images as a grid: gallery(q.images(dataset)).runs(pattern) */
    gallery: view('gallery'),
    jobList: view('jobList'),
    batchView: view('batchView'),
    grid,
    algo,
    component,
    defineKind,
    warmupPolicy: () => new SubRecorder('warmup'),
  };
}

export type Library = ReturnType<typeof createLibrary>;
