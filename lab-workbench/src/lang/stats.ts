import { rows, type Rows } from './rows';
import { quantile, rng } from './util';
import { derived, missing, num, type Value } from './values';

export interface PairedRatioResult {
  __estimate: true;
  estimator: 'pairedRatio';
  unit: string;
  median: Value;
  ci: [Value, Value];
  level: number;
  pairs: { rep: number; baseline: number; candidate: number; ratio: number }[];
  excluded: { rep: number; arm: string; reason: string }[];
  note: string;
}

const median = (xs: number[]) => quantile([...xs].sort((a, b) => a - b), 0.5);

/**
 * Paired candidate/baseline ratio of per-process medians. The process is the resampling unit, so a
 * bootstrap over correlated requests cannot masquerade as many independent experiments.
 */
function pairedRatio(opts: { unit?: string; ci?: number; field?: string; seed?: number } = {}) {
  const unit = opts.unit ?? 'process';
  const level = opts.ci ?? 0.95;
  const field = opts.field ?? 'latency';
  return {
    __estimator: true,
    kind: 'pairedRatio',
    opts: { unit, ci: level, field },
    describe: () => `paired ratio · unit=${unit} · ${Math.round(level * 100)} % CI`,
    of(input: Rows<Record<string, unknown>> | Record<string, unknown>[]): PairedRatioResult {
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
      const reps = [...new Set([...byArmRep.keys()].map((k) => Number(k.split('#')[1])))].sort((a, b) => a - b);
      const pairs: PairedRatioResult['pairs'] = [];
      for (const rep of reps) {
        const b = byArmRep.get(`baseline#${rep}`);
        const c = byArmRep.get(`candidate#${rep}`);
        if (!b || !c) continue;
        const mb = median(b)!;
        const mc = median(c)!;
        pairs.push({ rep, baseline: mb, candidate: mc, ratio: mc / mb });
      }
      const note = `${pairs.length} paired processes; ${excluded.length} excluded`;
      if (pairs.length === 0) {
        const m = missing('no paired valid processes', { unit: '×' });
        return { __estimate: true, estimator: 'pairedRatio', unit, median: m, ci: [m, m], level, pairs, excluded, note };
      }
      const ratios = pairs.map((p) => p.ratio);
      const r = rng(`pairedRatio:${ratios.join(',')}`);
      const boots: number[] = [];
      for (let i = 0; i < 2000; i++) {
        const sample = ratios.map(() => ratios[Math.floor(r.next() * ratios.length)]);
        boots.push(median(sample)!);
      }
      boots.sort((a, b) => a - b);
      const lo = quantile(boots, (1 - level) / 2)!;
      const hi = quantile(boots, 1 - (1 - level) / 2)!;
      const method = `bootstrap over ${pairs.length} processes`;
      return {
        __estimate: true,
        estimator: 'pairedRatio',
        unit,
        median: derived(median(ratios)!, { unit: '×', method: `median of per-process ratios · ${note}` }),
        ci: [derived(lo, { unit: '×', method }), derived(hi, { unit: '×', method })],
        level,
        pairs,
        excluded,
        note,
      };
    },
  };
}

/** Open-loop accounting: on-time throughput in requests and windows, and what was still outstanding. */
function offered(input: Rows<Record<string, unknown>> | Record<string, unknown>[]): Record<string, Value> {
  const list = [...input];
  if (list.length === 0) return { requestsOnTime: missing('no requests') };
  // rates are per process: sum the offer windows of every repetition, never one window for all of them
  const byRep = new Map<unknown, number[]>();
  for (const r of list) byRep.set(r.rep ?? 0, [...(byRep.get(r.rep ?? 0) ?? []), num(r.scheduledArrival) ?? 0]);
  const span = [...byRep.values()].reduce((a, xs) => a + (Math.max(...xs) - Math.min(...xs) || 1), 0);
  const onTime = list.filter((r) => r.outcome === 'ok');
  const windows = onTime.reduce((a, r) => a + (num(r.windows) ?? 1), 0);
  const expired = list.filter((r) => r.outcome === 'expired').length;
  const rejected = list.filter((r) => r.outcome === 'rejected').length;
  const outstanding = list.filter((r) => r.outstandingAtStop === true).length;
  const m = `offered-rate accounting over ${byRep.size} process offer window${byRep.size === 1 ? '' : 's'}`;
  return {
    requestsOnTime: derived(onTime.length / span, { unit: 'req/s', method: m }),
    windowsOnTime: derived(windows / span, { unit: 'win/s', method: m }),
    expired: derived(expired / byRep.size, { method: `mean per process (${byRep.size} processes)` }),
    rejected: derived(rejected / byRep.size, { method: `mean per process (${byRep.size} processes)` }),
    outstandingAtEnd: derived(outstanding / byRep.size, { method: `mean per process at end of offer (${byRep.size} processes)` }),
    offered: derived(list.length, { method: 'count' }),
  };
}

export const stats = {
  pairedRatio,
  offered,
  summary: (input: Rows<Record<string, unknown>>, field: string) => rows(input).stats(field),
};
