import { isParamSpec, ParamSpec } from './params';
import { isLive, live, type LiveFn, type ParamRef, type SignalRef } from './refs';
import type { Query } from './query';
import { nextId } from './util';

export type Rec = Record<string, unknown[]>;
export interface CallLog {
  props: Rec;
  calls: { method: string; args: unknown[] }[];
  unknown: Set<string>;
}

/**
 * Wraps a builder in a Proxy: explicit methods run as written; any other method name is recorded
 * as a property (`.mark('bar')` → props.mark = ['bar']) and flagged if it is not in `known`.
 */
export function recorder<T extends object>(self: T, log: CallLog, known?: ReadonlySet<string>): T {
  const proxy: T = new Proxy(self, {
    get(target, prop, receiver) {
      if (typeof prop === 'symbol' || prop in target) {
        const v = Reflect.get(target, prop, receiver);
        return typeof v === 'function' ? v.bind(proxy) : v;
      }
      if (prop === 'then' || prop === 'toJSON') return undefined;
      return (...args: unknown[]) => {
        log.props[prop] = args;
        log.calls.push({ method: prop, args });
        if (known && !known.has(prop)) log.unknown.add(prop);
        return proxy;
      };
    },
  });
  return proxy;
}

const set = (...xs: string[]) => new Set(xs);
const COMMON_VIEW = ['focus', 'grow', 'height', 'title', 'eyebrow', 'missing', 'caption', 'width', 'span'];
export const VIEW_METHODS: Record<string, ReadonlySet<string>> = {
  table: set(...COMMON_VIEW, 'cols', 'sort', 'limit', 'labels'),
  chart: set(...COMMON_VIEW, 'mark', 'x', 'y', 'color', 'shape', 'sort', 'track', 'rule', 'filter', 'legend', 'roof'),
  timeline: set(...COMMON_VIEW, 'lanes', 'bucket', 'window', 'request'),
  stat: set(...COMMON_VIEW, 'unit', 'format', 'compare'),
  manifest: set(...COMMON_VIEW, 'fields'),
  manifestDiff: set(...COMMON_VIEW),
  mirror: set(...COMMON_VIEW, 'align', 'unmatched', 'request'),
  metrics: set(...COMMON_VIEW),
  kernelCard: set(...COMMON_VIEW),
  ledger: set(...COMMON_VIEW, 'groupBy', 'scope'),
  source: set(...COMMON_VIEW),
  route: set(...COMMON_VIEW),
  stepper: set(...COMMON_VIEW, 'show', 'compare', 'casts', 'tree', 'caveat', 'implements', 'step'),
  hypothesisCard: set(...COMMON_VIEW),
  note: set(...COMMON_VIEW),
  math: set(...COMMON_VIEW),
  text: set(...COMMON_VIEW, 'size', 'weight', 'color', 'mono'),
  row: set(...COMMON_VIEW, 'gap', 'pad', 'align'),
  stack: set(...COMMON_VIEW, 'gap', 'pad', 'align'),
  grid: set(...COMMON_VIEW, 'gap', 'pad'),
  split: set(...COMMON_VIEW),
  control: set(...COMMON_VIEW),
  runList: set(...COMMON_VIEW),
  jobList: set(...COMMON_VIEW),
  batchView: set(...COMMON_VIEW, 'show'),
  component: set(...COMMON_VIEW),
};

export class ViewB {
  readonly __view = true;
  readonly id = nextId('view:');
  name?: string;
  componentName?: string;
  describeText?: string;
  readonly props: Rec = {};
  readonly calls: { method: string; args: unknown[] }[] = [];
  readonly unknown = new Set<string>();
  readonly handlers: { event: string; fn: (...a: unknown[]) => unknown }[] = [];
  readonly children: ViewB[] = [];
  readonly slots: Record<string, ViewB> = {};
  constructor(
    readonly kind: string,
    readonly args: unknown[] = [],
  ) {
    const known = VIEW_METHODS[kind.startsWith('kind:') ? 'component' : kind];
    return recorder(this, this, known);
  }
  as(name: string) { this.name = name; return this; }
  on(event: string, fn: (...a: unknown[]) => unknown) { this.handlers.push({ event, fn }); return this; }
  add(...children: unknown[]) { for (const c of children.flat()) this.children.push(toView(c)); return this; }
  left(v: unknown) { this.slots.left = toView(v); return this; }
  right(v: unknown) { this.slots.right = toView(v); return this; }
  /** First argument recorded for a fluent prop. */
  p(name: string): unknown { return this.props[name]?.[0]; }
  pa(name: string): unknown[] | undefined { return this.props[name]; }
}

export const isView = (x: unknown): x is ViewB => typeof x === 'object' && x !== null && (x as ViewB).__view === true;

export function toView(x: unknown): ViewB {
  if (isView(x)) return x;
  if (typeof x === 'string' || typeof x === 'number' || isLive(x)) return new ViewB('text', [x]);
  if (isParamSpec(x)) throw new TypeError('A parameter spec is not a view: declare it with b.param(name, spec)');
  return new ViewB('note', [JSON.stringify(x)]);
}

// ParamSpec.bind(signal) gives an ad hoc control bound to a board signal.
(ParamSpec.prototype as unknown as { bind: (s: SignalRef) => ViewB }).bind = function bind(this: ParamSpec, sig: SignalRef) {
  return new ViewB('control', [this, sig]);
};

export interface ParamSlot {
  name: string;
  key: string;
  urlKey: string;
  scope: 'lab' | 'experiment' | 'board';
  owner: string;
  spec: ParamSpec;
  ref: ParamRef;
  order: number;
}

let paramOrder = 0;
function declareParam(name: string, spec: unknown, scope: ParamSlot['scope'], owner: string): ParamSlot {
  if (!/^[a-z][a-zA-Z0-9_-]*$/.test(name)) throw new TypeError(`parameter name "${name}" must match [a-z][a-zA-Z0-9_-]*`);
  if (!isParamSpec(spec)) throw new TypeError(`param('${name}', …) expects a parameter kind such as slider({ … }) or select([…])`);
  const urlKey = scope === 'experiment' ? `${owner}.${name}` : name;
  const key = scope === 'board' ? `${owner}:${name}` : urlKey;
  const ref: ParamRef = { __param: true, key, urlKey, name, scope, owner };
  return { name, key, urlKey, scope, owner, spec, ref, order: paramOrder++ };
}

export class SubRecorder {
  readonly props: Rec = {};
  readonly calls: { method: string; args: unknown[] }[] = [];
  readonly unknown = new Set<string>();
  constructor(readonly kind: string, known?: ReadonlySet<string>) {
    return recorder(this, this, known);
  }
}

export class ArmB {
  readonly props: Rec = {};
  readonly calls: { method: string; args: unknown[] }[] = [];
  readonly unknown = new Set<string>();
  constructor(
    readonly name: string,
    readonly role: 'baseline' | 'candidate' | 'treatment',
    readonly cell?: Record<string, unknown>,
  ) {
    return recorder(this, this, set('rev', 'switches', 'corunner', 'pin'));
  }
}

export const CAPTURE_METHODS: Record<string, ReadonlySet<string>> = {
  timing: set('processes', 'pairs'),
  trace: set('apis', 'ranges', 'requests', 'buffer', 'processes'),
  kernels: set('launch', 'sections', 'cacheControl', 'replay'),
  memory: set('ledgers', 'around', 'states'),
  cpu: set('events', 'callGraph'),
  sanitizer: set('tool'),
  // detection qualification reports (ML-PERF-002)
  stages: set('processes'),
  predictions: set(),
  tests: set(),
};

export interface CollectorDef {
  defaults?: Record<string, unknown>;
  describe?: (p: Record<string, unknown>) => string;
  lower?: (p: Record<string, unknown>) => unknown;
  import?: (...a: unknown[]) => unknown;
}

export class CaptureB {
  readonly id = nextId('cap:');
  readonly props: Rec = {};
  readonly calls: { method: string; args: unknown[] }[] = [];
  readonly unknown = new Set<string>();
  constructor(
    readonly mode: string,
    readonly collector?: { name: string; def: CollectorDef; props: Record<string, unknown> },
  ) {
    return recorder(this, this, CAPTURE_METHODS[mode]);
  }
  /** `sections('+X')` appends to the current list; plain names replace it. */
  sections(...names: string[]) {
    const current = (this.props.sections ?? []) as string[];
    const additive = names.length > 0 && names.every((n) => n.startsWith('+'));
    this.props.sections = additive ? [...current, ...names.map((n) => n.slice(1))] : names;
    this.calls.push({ method: 'sections', args: names });
    return this;
  }
  clone(): CaptureB {
    const c = new CaptureB(this.mode, this.collector);
    for (const [k, v] of Object.entries(this.props)) c.props[k] = [...v];
    c.calls.push(...this.calls);
    return c;
  }
}

export interface PhaseDecl {
  type: 'stable' | 'alternate' | 'churn';
  name: string;
  opts: Record<string, unknown>;
}

export class PhasesB {
  readonly list: PhaseDecl[] = [];
  onlyNames?: string[];
  stable(name: string, opts: Record<string, unknown> = {}) { this.list.push({ type: 'stable', name, opts }); return this; }
  alternate(name: string, opts: Record<string, unknown> = {}) { this.list.push({ type: 'alternate', name, opts }); return this; }
  churn(name: string, opts: Record<string, unknown> = {}) { this.list.push({ type: 'churn', name, opts }); return this; }
  only(...names: string[]) { this.onlyNames = names; return this; }
}

export interface WhenDecl {
  cond: unknown;
  fn: (e: ExperimentB) => unknown;
  cell?: Record<string, unknown>;
}

const EXPERIMENT_PROPS = set(
  'question', 'workload', 'boundary', 'host', 'state', 'warmup', 'expect', 'gate', 'repeat', 'compare',
  'offer', 'admission', 'deadline', 'drain', 'units', 'purpose', 'evidence',
);

export class ExperimentB {
  readonly props: Rec = {};
  readonly calls: { method: string; args: unknown[] }[] = [];
  readonly unknown = new Set<string>();
  readonly arms: ArmB[] = [];
  readonly captures: CaptureB[] = [];
  readonly params: ParamSlot[] = [];
  readonly whens: WhenDecl[] = [];
  readonly limitations: { text: string; cell?: Record<string, unknown> }[] = [];
  readonly skippedCells: { cell?: Record<string, unknown>; reason?: string }[] = [];
  phasesB?: PhasesB;
  currentCell?: Record<string, unknown>;
  forkOf?: string;
  matrixAxes?: Record<string, unknown[]>;
  constructor(
    readonly id: string,
    readonly lab: LabB,
  ) {
    return recorder(this, this, EXPERIMENT_PROPS);
  }
  /** `.baseline(rev, a => a.switches({...}))`: the optional callback configures the arm like `.arm()` does. */
  baseline(rev: unknown, fn?: (a: ArmB) => unknown) { const a = armWith(new ArmB('baseline', 'baseline', this.currentCell), rev); fn?.(a); this.arms.push(a); return this; }
  candidate(rev: unknown, fn?: (a: ArmB) => unknown) { const a = armWith(new ArmB('candidate', 'candidate', this.currentCell), rev); fn?.(a); this.arms.push(a); return this; }
  arm(name: string, fn?: (a: ArmB) => unknown) {
    const a = new ArmB(name, 'treatment', this.currentCell);
    fn?.(a);
    this.arms.push(a);
    return this;
  }
  capture(...caps: unknown[]) {
    if (typeof caps[0] === 'string') {
      const target = this.captures.find((c) => c.mode === caps[0]);
      if (!target) throw new Error(`experiment ${this.id} has no ${String(caps[0])} capture to patch`);
      (caps[1] as (c: CaptureB) => unknown)(target);
      return this;
    }
    for (const c of caps.flat()) {
      if (!(c instanceof CaptureB) && !(c as CaptureB)?.mode) throw new TypeError('capture() expects capture.timing(), capture.trace(), …');
      this.captures.push(c as CaptureB);
    }
    return this;
  }
  /** Experiment parameters chain like the rest of the contract; read them with ctx.param(name). */
  param(name: string, spec: unknown) {
    this.params.push(declareParam(name, spec, 'experiment', this.id));
    return this;
  }
  phases(fn: (p: PhasesB) => unknown) { const p = new PhasesB(); fn(p); this.phasesB = p; return this; }
  matrix(axes: Record<string, unknown[]>, fn: (e: ExperimentB, cell: Record<string, unknown>) => unknown) {
    this.matrixAxes = axes;
    for (const cell of cartesian(axes)) {
      this.currentCell = cell;
      fn(this, cell);
    }
    this.currentCell = undefined;
    return this;
  }
  when(cond: unknown, fn: (e: ExperimentB) => unknown) { this.whens.push({ cond, fn, cell: this.currentCell }); return this; }
  limitation(text: string) { this.limitations.push({ text, cell: this.currentCell }); return this; }
  skip() {
    const reason = [...this.limitations].reverse().find((l) => l.cell === this.currentCell)?.text;
    this.skippedCells.push({ cell: this.currentCell, reason });
    return this;
  }
  fork(id: string, fn?: (e: ExperimentB) => unknown): ExperimentB {
    const e = new ExperimentB(id, this.lab);
    for (const [k, v] of Object.entries(this.props)) e.props[k] = [...v];
    e.calls.push(...this.calls);
    for (const a of this.arms) {
      const b = new ArmB(a.name, a.role, a.cell);
      Object.assign(b.props, a.props);
      e.arms.push(b);
    }
    for (const c of this.captures) e.captures.push(c.clone());
    e.phasesB = this.phasesB;
    e.whens.push(...this.whens);
    e.forkOf = this.id;
    fn?.(e);
    this.lab.experiments.push(e);
    return e;
  }
}

function armWith(a: ArmB, rev: unknown): ArmB {
  a.props.rev = [rev];
  return a;
}

function cartesian(axes: Record<string, unknown[]>): Record<string, unknown>[] {
  let cells: Record<string, unknown>[] = [{}];
  for (const [axis, values] of Object.entries(axes)) {
    cells = cells.flatMap((c) => values.map((v) => ({ ...c, [axis]: v })));
  }
  return cells;
}

export interface DeriveDecl {
  name: string;
  input: unknown;
  fn: (rows: unknown, ctx: unknown) => unknown;
  id: string;
}

export class BoardB {
  titleText?: unknown;
  subtitleText?: unknown;
  areas?: string;
  readonly views: ViewB[] = [];
  readonly sigs: SignalRef[] = [];
  readonly derivedSigs: { ref: SignalRef; fn: LiveFn }[] = [];
  readonly params: ParamSlot[] = [];
  readonly presets: { name: string; values: Record<string, unknown> }[] = [];
  readonly effects: { id: string; fn: (...a: unknown[]) => unknown }[] = [];
  readonly unknown = new Set<string>();
  readonly props: Rec = {};
  readonly calls: { method: string; args: unknown[] }[] = [];
  constructor(
    readonly id: string,
    readonly lab: LabB,
  ) {
    return recorder(this, this, set('footer', 'eyebrow'));
  }
  title(t: unknown) { this.titleText = t; return this; }
  subtitle(t: unknown) { this.subtitleText = t; return this; }
  layout(areas: unknown) {
    this.areas = typeof areas === 'object' && areas !== null && '__areas' in areas ? String((areas as { __areas: string }).__areas) : String(areas);
    return this;
  }
  add(...views: unknown[]) { for (const v of views.flat()) this.views.push(toView(v)); return this; }
  sig(name: string, init: unknown): SignalRef {
    const ref: SignalRef = { __signal: true, key: `${this.id}:${name}`, name, board: this.id, init };
    this.sigs.push(ref);
    return ref;
  }
  derive(name: string, fn: (...a: never[]) => unknown): SignalRef {
    const ref = this.sig(name, undefined);
    this.derivedSigs.push({ ref, fn: live(fn as never) });
    return ref;
  }
  param(name: string, spec: unknown): ParamRef {
    const slot = declareParam(name, spec, 'board', this.id);
    this.params.push(slot);
    return slot.ref;
  }
  preset(name: string, values: Record<string, unknown>) { this.presets.push({ name, values }); return this; }
  effect(fn: (...a: unknown[]) => unknown) { this.effects.push({ id: nextId('effect:'), fn }); return this; }
}

export class HypothesisB {
  claimText = '';
  prediction?: { query: Query; fn: (row: unknown) => unknown };
  readonly support: unknown[] = [];
  readonly alternativesList: string[] = [];
  scopeText?: string;
  readonly props: Rec = {};
  readonly calls: { method: string; args: unknown[] }[] = [];
  readonly unknown = new Set<string>();
  constructor(readonly id: string) {
    return recorder(this, this, set());
  }
  claim(t: string) { this.claimText = t; return this; }
  predicts(query: Query, fn: (row: unknown) => unknown) { this.prediction = { query, fn }; return this; }
  supportedBy(...qs: unknown[]) { this.support.push(...qs); return this; }
  alternatives(...texts: string[]) { this.alternativesList.push(...texts); return this; }
  scope(t: string) { this.scopeText = t; return this; }
}

const LAB_METHODS = set('description');

export class LabB {
  readonly __lab = true;
  dataMap: Record<string, unknown> = {};
  readonly params: ParamSlot[] = [];
  readonly experiments: ExperimentB[] = [];
  readonly derives: DeriveDecl[] = [];
  readonly hypotheses: HypothesisB[] = [];
  readonly boards: BoardB[] = [];
  readonly defaultsFns: ((b: BoardB) => unknown)[] = [];
  readonly props: Rec = {};
  readonly calls: { method: string; args: unknown[] }[] = [];
  readonly unknown = new Set<string>();
  constructor(readonly titleText: string) {
    return recorder(this, this, LAB_METHODS);
  }
  data(name: string | Record<string, unknown>, value?: unknown) {
    if (typeof name === 'string') this.dataMap[name] = value;
    else this.dataMap = { ...this.dataMap, ...name };
    return this;
  }
  param(name: string, spec: unknown) {
    this.params.push(declareParam(name, spec, 'lab', 'lab'));
    return this;
  }
  experiment(id: string, fn: (e: ExperimentB) => unknown) {
    if (this.experiments.some((e) => e.id === id)) throw new Error(`duplicate experiment id "${id}"`);
    const e = new ExperimentB(id, this);
    this.experiments.push(e);
    fn(e);
    return this;
  }
  derive(name: string, input: unknown, fn: (rows: never, ctx: never) => unknown) {
    if (typeof fn !== 'function') throw new TypeError(`derive('${name}', input, fn) needs a function`);
    this.derives.push({ name, input, fn: fn as DeriveDecl['fn'], id: `derive:${name}` });
    return this;
  }
  hypothesis(id: string, fn: (h: HypothesisB) => unknown) {
    const h = new HypothesisB(id);
    fn(h);
    this.hypotheses.push(h);
    return this;
  }
  board(id: string, fn: (b: BoardB) => unknown) {
    if (this.boards.some((b) => b.id === id)) throw new Error(`duplicate board id "${id}"`);
    const b = new BoardB(id, this);
    for (const d of this.defaultsFns) d(b);
    fn(b);
    this.boards.push(b);
    return this;
  }
  defaults(fn: (b: BoardB) => unknown) { this.defaultsFns.push(fn); return this; }
  each<T>(list: T[], fn: (l: LabB, item: T, i: number) => unknown) { list.forEach((x, i) => fn(this, x, i)); return this; }
  /** The `ParamRef` of a lab parameter, for programs that need it outside plan lambdas. */
  ref(name: string): ParamRef | undefined { return this.params.find((p) => p.name === name)?.ref; }
}

export const isLab = (x: unknown): x is LabB => typeof x === 'object' && x !== null && (x as LabB).__lab === true;
