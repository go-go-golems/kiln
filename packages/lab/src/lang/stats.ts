// The estimators lab programs call (`stats.pairedRatio`, `stats.offered`, `stats.summary`). Their DSL surface is
// Perf Lab's (PL/src/lang/stats.ts); their statistics — median, quantile, the bootstrap and the paired ratio — are
// @kiln/evidence's (guide §25, §33.1). Deliberate changes, each recorded in the Phase 8a diary:
// - pairedRatio honours its `seed` option (P-9); without one it derives the seed from the ratios exactly as Perf Lab
//   did, so its intervals are unchanged; the arm names are options (P-9); evidence's small-n caveat is reported (P-15).
// - offered leaves a missing arrival out of the offer window instead of reading it as 0, and reports the windows rate
//   as missing when an on-time request has no window count instead of counting it as 1 (P-10).
import { median, pairedRatio as evidencePairedRatio } from '@kiln/evidence';
import { rows, type Rows } from './rows.ts';
import { seedFrom } from './util.ts';
import { derived, missing, num, type Value } from './values.ts';

export interface PairedRatioResult {
  __estimate: true;
  estimator: 'pairedRatio';
  unit: string;
  /** median of the per-repetition ratios candidate ÷ baseline; carries `ci` and `n` too */
  median: Value;
  ci: [Value, Value];
  level: number;
  pairs: { rep: number; baseline: number; candidate: number; ratio: number }[];
  excluded: { rep: number; arm: string; reason: string }[];
  note: string;
  /** what the interval cannot claim (small n, zero spread, a single repetition), from evidence; null when nothing */
  caveat: string | null;
  /** the bootstrap's seed: the `seed` option, else derived from the ratios (Perf Lab's stream) */
  seed: number | string | null;
  /** pairs used */
  n: number;
}

export interface PairedRatioOpts {
  /** the resampling unit, for the description; the repetition (`process`) is the only one implemented */
  unit?: string;
  /** confidence level of the interval; default 0.95 */
  ci?: number;
  /** the row field to compare; default `latency` */
  field?: string;
  /** seed of the bootstrap; default: derived from the ratios */
  seed?: number | string;
  /** arm names; defaults `baseline` and `candidate` */
  baseline?: string;
  candidate?: string;
}

type Input = Rows<Record<string, unknown>> | Iterable<Record<string, unknown>>;

/**
 * Paired candidate/baseline ratio of per-process medians. The process is the resampling unit, so a
 * bootstrap over correlated requests cannot masquerade as many independent experiments.
 */
function pairedRatio(opts: PairedRatioOpts = {}) {
  const unit = opts.unit ?? 'process';
  const level = opts.ci ?? 0.95;
  const field = opts.field ?? 'latency';
  const baselineArm = opts.baseline ?? 'baseline';
  const candidateArm = opts.candidate ?? 'candidate';
  return {
    __estimator: true,
    kind: 'pairedRatio',
    opts: { unit, ci: level, field, ...(opts.seed === undefined ? {} : { seed: opts.seed }), ...(opts.baseline || opts.candidate ? { baseline: baselineArm, candidate: candidateArm } : {}) },
    describe: () => `paired ratio · unit=${unit} · ${Math.round(level * 100)} % CI`,
    of(input: Input): PairedRatioResult {
      const byArmRep = new Map<string, number[]>();
      const excluded: PairedRatioResult['excluded'] = [];
      const excludedKeys = new Set<string>();
      for (const r of input) {
        const rep = Number(r.rep ?? 0);
        const arm = String(r.arm);
        const key = `${arm}#${rep}`;
        if (r.runValid === false) {
          if (!excludedKeys.has(key)) {
            excludedKeys.add(key);
            excluded.push({ rep, arm, reason: String(r.invalidReason ?? 'run invalid') });
          }
          continue;
        }
        const v = num(r[field]);
        if (v === null || r.outcome !== 'ok') continue;
        const list = byArmRep.get(key);
        if (list) list.push(v);
        else byArmRep.set(key, [v]);
      }
      const reps = [...new Set([...byArmRep.keys()].map((k) => Number(k.slice(k.lastIndexOf('#') + 1))))].sort((a, b) => a - b);
      const pairs: PairedRatioResult['pairs'] = [];
      for (const rep of reps) {
        const b = byArmRep.get(`${baselineArm}#${rep}`);
        const c = byArmRep.get(`${candidateArm}#${rep}`);
        if (!b || !c) continue;
        const mb = median(b)!;
        const mc = median(c)!;
        pairs.push({ rep, baseline: mb, candidate: mc, ratio: mc / mb });
      }
      const none = (reason: string, seed: PairedRatioResult['seed'], caveat: string | null): PairedRatioResult => {
        const m = missing(reason, { unit: '×' });
        return { __estimate: true, estimator: 'pairedRatio', unit, median: m, ci: [m, m], level, pairs, excluded, note: `${pairs.length} paired processes; ${excluded.length} excluded`, caveat, seed, n: 0 };
      };
      if (pairs.length === 0) return none('no paired valid processes', null, null);
      const seed = opts.seed ?? seedFrom(`pairedRatio:${pairs.map((p) => p.ratio).join(',')}`);
      const s = evidencePairedRatio(pairs.map((p) => ({ rep: p.rep, a: p.baseline, b: p.candidate })), { level, seed });
      for (const e of s.excluded) excluded.push({ rep: e.rep, arm: `${candidateArm}/${baselineArm}`, reason: e.reason });
      const note = `${pairs.length} paired processes; ${excluded.length} excluded`;
      if (s.median === null || s.ci === null) return none('no paired valid processes', seed, s.note);
      const method = `bootstrap over ${s.n} processes`;
      return {
        __estimate: true,
        estimator: 'pairedRatio',
        unit,
        median: derived(s.median, { unit: '×', method: `median of per-process ratios · ${note}`, ci: s.ci, n: s.n }),
        ci: [derived(s.ci[0], { unit: '×', method }), derived(s.ci[1], { unit: '×', method })],
        level,
        pairs,
        excluded,
        note,
        caveat: s.note,
        seed,
        n: s.n,
      };
    },
  };
}

/** Open-loop accounting: on-time throughput in requests and windows, and what was still outstanding. */
function offered(input: Input): Record<string, Value> {
  const list = [...input];
  if (list.length === 0) return { requestsOnTime: missing('no requests') };
  // rates are per process: sum the offer windows of every repetition, never one window for all of them;
  // a request without a scheduled arrival says nothing about its process's window (it is not at t = 0)
  const processes = new Set<unknown>();
  const arrivals = new Map<unknown, number[]>();
  let noArrival = 0;
  for (const r of list) {
    const rep = r.rep ?? 0;
    processes.add(rep);
    const at = num(r.scheduledArrival);
    if (at === null) noArrival++;
    else arrivals.set(rep, [...(arrivals.get(rep) ?? []), at]);
  }
  const p = processes.size;
  const without = [...processes].filter((rep) => !arrivals.has(rep)).length;
  const span = [...arrivals.values()].reduce((a, xs) => a + (Math.max(...xs) - Math.min(...xs) || 1), 0);
  const onTime = list.filter((r) => r.outcome === 'ok');
  const noWindows = onTime.filter((r) => num(r.windows) === null).length;
  const windows = onTime.reduce((a, r) => a + (num(r.windows) ?? 0), 0);
  const expired = list.filter((r) => r.outcome === 'expired').length;
  const rejected = list.filter((r) => r.outcome === 'rejected').length;
  const outstanding = list.filter((r) => r.outstandingAtStop === true).length;
  const m = `offered-rate accounting over ${p} process offer window${p === 1 ? '' : 's'}${noArrival ? ` · ${noArrival} request${noArrival === 1 ? '' : 's'} without an arrival time left out of the windows` : ''}`;
  const noWindow = without ? `${without} of ${p} processes have no scheduled arrival times` : null;
  return {
    requestsOnTime: noWindow ? missing(noWindow, { unit: 'req/s' }) : derived(onTime.length / span, { unit: 'req/s', method: m }),
    windowsOnTime: noWindow
      ? missing(noWindow, { unit: 'win/s' })
      : noWindows
        ? missing(`${noWindows} on-time request${noWindows === 1 ? '' : 's'} without a window count`, { unit: 'win/s' })
        : derived(windows / span, { unit: 'win/s', method: m }),
    expired: derived(expired / p, { method: `mean per process (${p} processes)` }),
    rejected: derived(rejected / p, { method: `mean per process (${p} processes)` }),
    outstandingAtEnd: derived(outstanding / p, { method: `mean per process at end of offer (${p} processes)` }),
    offered: derived(list.length, { method: 'count' }),
  };
}

export const stats = {
  pairedRatio,
  offered,
  summary: (input: Input, field: string) => rows(input).stats(field),
};
