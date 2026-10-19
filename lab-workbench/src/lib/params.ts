import type { ParamSummary } from '@/lang/ir';
import { normalizeOptions, type OptionItem } from '@/lang/params';
import { isQuery } from '@/lang/query';
import { isLive } from '@/lang/refs';
import { makeDollar, materialize, paramValue, runsMatching, type BuildRegistry, type RuntimeState } from '@/lang/runtime';

export interface RunChoice {
  ref: string;
  label: string;
  valid: boolean;
}

/** Options for a control: literal and plan options come from the IR; data and view options are computed now. */
export function resolveOptions(reg: BuildRegistry, state: RuntimeState, p: ParamSummary): OptionItem[] | null {
  if (p.options) return p.options;
  const spec = reg.params.get(p.key)?.slot.spec;
  if (!spec) return null;
  const raw = spec.c.options;
  try {
    if (isLive(raw)) return normalizeOptions(raw.fn(makeDollar(reg, state)));
    if (isQuery(raw)) {
      const v = materialize(reg, raw, state);
      return normalizeOptions(Array.isArray(v) ? [...new Set(v.map((x) => (typeof x === 'object' && x && 'name' in x ? String((x as { name: unknown }).name) : x)))] : []);
    }
  } catch {
    return [];
  }
  return null;
}

export function runChoices(reg: BuildRegistry, p: ParamSummary): RunChoice[] {
  return runsMatching(reg, p.constraints.runPattern ?? '*/*/*').map((ref) => {
    const run = reg.source.entity(ref);
    const valid = Boolean((run?.validity as { ok?: boolean } | undefined)?.ok);
    const complete = Boolean((run?.coverage as { complete?: boolean } | undefined)?.complete);
    return { ref, valid, label: `${ref}${valid ? '' : ' · invalid'}${complete ? '' : ' · gaps'}` };
  });
}

export function isVisible(reg: BuildRegistry, state: RuntimeState, key: string): boolean {
  const when = reg.params.get(key)?.slot.spec.m.when;
  if (when === undefined) return true;
  try {
    if (isLive(when)) return Boolean(when.fn(makeDollar(reg, state)));
    if (typeof when === 'function') return Boolean((when as (c: unknown) => unknown)({ param: (n: string) => paramValue(reg, n, state) }));
    return Boolean(when);
  } catch {
    return true;
  }
}
