import type { Binding } from './refs';
import { globToRegExp } from './util';

export type ControlKind =
  | 'slider'
  | 'range'
  | 'number'
  | 'checkbox'
  | 'toggle'
  | 'select'
  | 'multiselect'
  | 'radio'
  | 'text'
  | 'seed'
  | 'pickRun';

export type OptionValue = string | number | boolean;
export interface OptionItem {
  value: OptionValue;
  label: string;
  help?: string;
  disabled?: boolean;
}

export interface ParamConstraints {
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  scale?: 'linear' | 'log';
  /** Literal array, plan lambda, query or live lambda; resolved by the runtime. */
  options?: unknown;
  pattern?: string;
  maxLength?: number;
  placeholder?: string;
  runPattern?: string;
}

export interface ParamModifiers {
  label?: string;
  help?: string;
  default?: unknown;
  unit?: string;
  format?: (v: unknown) => string;
  group?: string;
  order?: number;
  when?: unknown;
  validate?: (v: unknown) => true | string;
  affects?: Binding;
  confirm?: string;
  url?: string | false;
  persist?: 'url' | 'local' | 'none';
  debounce?: number;
}

/** Fluent parameter specification: a kind, its constraints and its modifiers. */
export class ParamSpec {
  readonly __paramSpec = true;
  readonly m: ParamModifiers = {};
  constructor(
    readonly control: ControlKind,
    readonly c: ParamConstraints = {},
  ) {}
  label(t: string) { this.m.label = t; return this; }
  help(t: string) { this.m.help = t; return this; }
  default(v: unknown) { this.m.default = v; return this; }
  unit(u: string) { this.m.unit = u; return this; }
  format(fn: (v: unknown) => string) { this.m.format = fn; return this; }
  group(g: string) { this.m.group = g; return this; }
  order(n: number) { this.m.order = n; return this; }
  when(cond: unknown) { this.m.when = cond; return this; }
  validate(fn: (v: unknown) => true | string) { this.m.validate = fn; return this; }
  affects(b: Binding) { this.m.affects = b; return this; }
  confirm(text: string) { this.m.confirm = text; return this; }
  url(alias: string | false) { this.m.url = alias; return this; }
  persist(p: 'url' | 'local' | 'none') { this.m.persist = p; return this; }
  debounce(ms: number) { this.m.debounce = ms; return this; }
  get unitLabel(): string | undefined { return this.m.unit ?? this.c.unit; }
}

export const isParamSpec = (x: unknown): x is ParamSpec =>
  typeof x === 'object' && x !== null && (x as ParamSpec).__paramSpec === true;

type NumOpts = { min?: number; max?: number; step?: number; unit?: string; scale?: 'linear' | 'log' };

export const paramKinds = {
  slider: (o: NumOpts = {}) => new ParamSpec('slider', { min: 0, max: 1, step: 0.01, ...o }),
  range: (o: NumOpts = {}) => new ParamSpec('range', { min: 0, max: 1, step: 0.01, ...o }),
  number: (o: NumOpts = {}) => new ParamSpec('number', { step: 1, ...o }),
  checkbox: () => new ParamSpec('checkbox'),
  toggle: (options: unknown) => new ParamSpec('toggle', { options }),
  select: (options: unknown) => new ParamSpec('select', { options }),
  multiselect: (options: unknown) => new ParamSpec('multiselect', { options }),
  radio: (options: unknown) => new ParamSpec('radio', { options }),
  text: (o: { placeholder?: string; pattern?: string; maxLength?: number } = {}) => new ParamSpec('text', o),
  seed: () => new ParamSpec('seed', { min: 0, max: 2 ** 31 - 1, step: 1 }),
  pickRun: (pattern: string) => new ParamSpec('pickRun', { runPattern: pattern }),
};

export function normalizeOptions(raw: unknown): OptionItem[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.map((o) =>
    typeof o === 'object' && o !== null && 'value' in o
      ? { ...(o as OptionItem), label: (o as Partial<OptionItem>).label ?? String((o as OptionItem).value) }
      : { value: o as OptionValue, label: String(o) },
  );
}

/** Literal options only; computed options return null and are resolved by the runtime. */
export const literalOptions = (spec: ParamSpec): OptionItem[] | null => normalizeOptions(spec.c.options);

export function implicitDefault(spec: ParamSpec, options: OptionItem[] | null): unknown {
  switch (spec.control) {
    case 'slider':
    case 'number':
      return spec.c.min ?? 0;
    case 'range':
      return [spec.c.min ?? 0, spec.c.max ?? 1];
    case 'checkbox':
      return false;
    case 'toggle':
    case 'select':
    case 'radio':
      return options?.find((o) => !o.disabled)?.value ?? null;
    case 'multiselect':
      return [];
    case 'text':
      return '';
    case 'seed':
      return 1;
    case 'pickRun':
      return null;
  }
}

export type Check = { ok: true; value: unknown } | { ok: false; error: string };

const inBounds = (spec: ParamSpec, n: number): string | null => {
  if (!Number.isFinite(n)) return 'not a finite number';
  if (spec.c.min !== undefined && n < spec.c.min) return `below minimum ${spec.c.min}`;
  if (spec.c.max !== undefined && n > spec.c.max) return `above maximum ${spec.c.max}`;
  return null;
};

/** Validate a value against the kind's constraints, the (resolved) options and `.validate()`. */
export function checkParam(spec: ParamSpec, value: unknown, options: OptionItem[] | null): Check {
  const fail = (error: string): Check => ({ ok: false, error });
  const base: Check = { ok: true, value };
  switch (spec.control) {
    case 'slider':
    case 'number': {
      if (typeof value !== 'number') return fail('expected a number');
      const e = inBounds(spec, value);
      if (e) return fail(e);
      break;
    }
    case 'seed':
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return fail('expected a non-negative integer');
      break;
    case 'range': {
      if (!Array.isArray(value) || value.length !== 2 || value.some((v) => typeof v !== 'number')) {
        return fail('expected [lo, hi]');
      }
      const [lo, hi] = value as number[];
      const e = inBounds(spec, lo) ?? inBounds(spec, hi);
      if (e) return fail(e);
      if (lo > hi) return fail('lower bound exceeds upper bound');
      break;
    }
    case 'checkbox':
      if (typeof value !== 'boolean') return fail('expected true or false');
      break;
    case 'toggle':
    case 'select':
    case 'radio':
      if (options && !options.some((o) => o.value === value)) return fail(`not one of ${options.map((o) => o.value).join(', ')}`);
      break;
    case 'multiselect':
      if (!Array.isArray(value)) return fail('expected a list');
      if (options) {
        const bad = (value as unknown[]).filter((v) => !options.some((o) => o.value === v));
        if (bad.length) return fail(`not available: ${bad.join(', ')}`);
      }
      break;
    case 'text': {
      if (typeof value !== 'string') return fail('expected text');
      if (spec.c.maxLength !== undefined && value.length > spec.c.maxLength) return fail(`longer than ${spec.c.maxLength}`);
      if (spec.c.pattern && !new RegExp(`^(?:${spec.c.pattern})$`).test(value)) return fail(`does not match ${spec.c.pattern}`);
      break;
    }
    case 'pickRun':
      if (value === null) break;
      if (typeof value !== 'string' || !/^[^/#]+\/[^/#]+\/[^/#]+#\d+$/.test(value)) return fail('expected a run reference');
      if (spec.c.runPattern && !globToRegExp(spec.c.runPattern.includes('#') ? spec.c.runPattern : `${spec.c.runPattern}#*`).test(value)) return fail(`not a ${spec.c.runPattern} run`);
      break;
  }
  if (spec.m.validate) {
    const r = spec.m.validate(value);
    if (r !== true) return fail(typeof r === 'string' ? r : 'invalid');
  }
  return base;
}

const optionFromString = (s: string, options: OptionItem[] | null): unknown => {
  const hit = options?.find((o) => String(o.value) === s);
  return hit ? hit.value : s;
};

/** URL encoding (spec §6.7). Returns null when the value equals the default (omitted from the URL). */
export function encodeParam(spec: ParamSpec, value: unknown, defaultValue: unknown): string | null {
  if (JSON.stringify(value) === JSON.stringify(defaultValue)) return null;
  switch (spec.control) {
    case 'range':
      return `${(value as number[])[0]}..${(value as number[])[1]}`;
    case 'checkbox':
      return value ? '1' : '0';
    case 'multiselect':
      return (value as unknown[]).map((v) => encodeURIComponent(String(v))).join(',');
    default:
      return value === null || value === undefined ? null : String(value);
  }
}

export function decodeParam(spec: ParamSpec, text: string, options: OptionItem[] | null): Check {
  let value: unknown;
  switch (spec.control) {
    case 'slider':
    case 'number':
    case 'seed':
      value = Number(text);
      break;
    case 'range': {
      const m = /^(-?[\d.e+-]+)\.\.(-?[\d.e+-]+)$/.exec(text);
      if (!m) return { ok: false, error: `expected lo..hi, got "${text}"` };
      value = [Number(m[1]), Number(m[2])];
      break;
    }
    case 'checkbox':
      if (text !== '1' && text !== '0') return { ok: false, error: `expected 1 or 0, got "${text}"` };
      value = text === '1';
      break;
    case 'multiselect':
      value = text === '' ? [] : text.split(',').map((s) => optionFromString(decodeURIComponent(s), options));
      break;
    case 'toggle':
    case 'select':
    case 'radio':
      value = optionFromString(text, options);
      break;
    default:
      value = text;
  }
  return checkParam(spec, value, options);
}

export function formatParam(spec: ParamSpec, value: unknown): string {
  if (spec.m.format) return spec.m.format(value);
  const unit = spec.unitLabel ? ` ${spec.unitLabel}` : '';
  if (spec.control === 'range' && Array.isArray(value)) return `${value[0]}–${value[1]}${unit}`;
  if (spec.control === 'checkbox') return value ? 'on' : 'off';
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'none';
  if (value === null || value === undefined) return '—';
  return `${value}${unit}`;
}
