import { nextId } from './util.ts';

export type Phase = 'plan' | 'data' | 'view' | 'handler' | 'effect';
export type Binding = 'plan' | 'data' | 'view';

/** The reactive accessor passed to live lambdas, handlers and effects. */
export interface Dollar {
  (ref: unknown): unknown;
  read(name: string): unknown;
  set(ref: unknown, value: unknown): void;
  peek(ref: unknown): unknown;
  row?: unknown;
  entity?: unknown;
  key?: string;
  value?: unknown;
}

export interface LiveFn {
  __live: true;
  id: string;
  fn: ($: Dollar) => unknown;
}

export interface ParamRef {
  __param: true;
  /** Storage key: `name` (lab), `experiment.name` (experiment), `board:name` (board). */
  key: string;
  /** URL key: `name` or `experiment.name`. */
  urlKey: string;
  name: string;
  scope: 'lab' | 'experiment' | 'board';
  owner: string;
}

export interface SignalRef {
  __signal: true;
  key: string;
  name: string;
  board: string;
  init: unknown;
}

export const live = (fn: ($: Dollar) => unknown): LiveFn => {
  if (typeof fn !== 'function') throw new TypeError('live() takes a function: live($ => …)');
  return { __live: true, id: nextId('live:'), fn };
};

export const isLive = (x: unknown): x is LiveFn => typeof x === 'object' && x !== null && (x as LiveFn).__live === true;
export const isParamRef = (x: unknown): x is ParamRef =>
  typeof x === 'object' && x !== null && (x as ParamRef).__param === true;
export const isSignalRef = (x: unknown): x is SignalRef =>
  typeof x === 'object' && x !== null && (x as SignalRef).__signal === true;
export const isFn = (x: unknown): x is (...a: unknown[]) => unknown => typeof x === 'function';

export const BINDING_RANK: Record<Binding, number> = { view: 0, data: 1, plan: 2 };
export const strongest = (a: Binding | undefined, b: Binding): Binding =>
  a === undefined || BINDING_RANK[b] > BINDING_RANK[a] ? b : a;
