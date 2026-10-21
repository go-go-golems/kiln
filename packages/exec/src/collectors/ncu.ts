// ncu (guide §20.4): Nsight Compute wraps the step's process; every kernel launch the step makes is profiled for the
// metrics below (moved verbatim from kiln_runner.py's NCU_METRICS), one CSV row per launch in /job/out/ncu.csv.
// Kinds that launch kernels reduce their launch count for it (hint singleLaunch). Counters are taken at base clocks.
import type { Observation } from '../model.ts';
import type { Collector } from '../registry.ts';

export const NCU_METRICS: Record<string, string> = {
  ncu_sm_throughput_pct: 'sm__throughput.avg.pct_of_peak_sustained_elapsed',
  ncu_dram_throughput_pct: 'dram__throughput.avg.pct_of_peak_sustained_elapsed',
  ncu_achieved_occupancy_pct: 'sm__warps_active.avg.pct_of_peak_sustained_active',
  ncu_ld_sectors: 'l1tex__t_sectors_pipe_lsu_mem_global_op_ld.sum',
  ncu_ld_requests: 'l1tex__t_requests_pipe_lsu_mem_global_op_ld.sum',
  ncu_smem_bank_conflicts: 'l1tex__data_bank_conflicts_pipe_lsu_mem_shared.sum',
  ncu_branch_uniform_pct: 'smsp__sass_average_branch_targets_threads_uniform.pct',
  ncu_registers: 'launch__registers_per_thread',
  ncu_duration_us: 'gpu__time_duration.sum',
};

/** One CSV line, quoted fields with doubled quotes. */
export function csvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (q) {
      if (c === '"' && line[i + 1] === '"') (cur += '"'), i++;
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') out.push(cur), (cur = '');
    else cur += c;
  }
  out.push(cur);
  return out;
}

const TIME_UNITS: Record<string, number> = { nsecond: 1e-3, ns: 1e-3, usecond: 1, us: 1, msecond: 1e3, ms: 1e3, second: 1e6, s: 1e6 };

/** The `--page raw --csv` report: one row per profiled launch, with the kernel's function name and our metrics. */
export function parseNcuCsv(text: string): { kernel: string; counters: Record<string, number> }[] {
  const lines = text.split('\n').filter((l) => l.startsWith('"'));
  if (lines.length < 2) return [];
  const header = csvLine(lines[0]!);
  const hasUnits = !/^\d/.test(csvLine(lines[1]!)[0] ?? '');
  const units = hasUnits ? csvLine(lines[1]!) : [];
  const nameCol = header.indexOf('Kernel Name');
  const rows: { kernel: string; counters: Record<string, number> }[] = [];
  for (const line of lines.slice(hasUnits ? 2 : 1)) {
    const v = csvLine(line);
    const kernel = (v[nameCol] ?? '').replace(/\(.*$/, '').replace(/<.*$/, '').trim();
    const counters: Record<string, number> = {};
    for (const [key, metric] of Object.entries(NCU_METRICS)) {
      const i = header.indexOf(metric);
      if (i < 0) continue;
      const n = Number((v[i] ?? '').replace(/,/g, ''));
      if (!Number.isFinite(n)) continue;
      counters[key] = key === 'ncu_duration_us' ? n * (TIME_UNITS[units[i] ?? 'nsecond'] ?? 1e-3) : n;
    }
    if (counters.ncu_ld_requests) counters.ncu_ld_sectors_per_req = (counters.ncu_ld_sectors ?? 0) / counters.ncu_ld_requests;
    rows.push({ kernel, counters });
  }
  return rows;
}

export const ncu: Collector = {
  id: 'ncu', title: 'Nsight Compute counters', shape: 'wrapper',
  requires: [{ tool: 'ncu' }, { gpuCounters: true }],
  disturbs: ['latency', 'throughput'],
  exclusive: ['nsys'],
  hints: { singleLaunch: true },
  apply(step, ctx) {
    const t = ctx.tool('ncu');
    const bin = t?.bin ?? 'ncu';
    return {
      ...step,
      wrap: [bin, '--target-processes', 'all', '--csv', '--page', 'raw', '--metrics', Object.values(NCU_METRICS).join(','), '--log-file', '/job/out/ncu.csv', '--', ...step.wrap],
      mounts: t?.mount ? [...step.mounts, { role: 'tool', source: t.mount, target: t.mount, ro: true }] : step.mounts,
    };
  },
  import(out, ctx) {
    const data = out.files.get('ncu.csv');
    if (!data) return out.step.serves.map((s): Observation => ({ type: 'error', capture: s.capture, rep: s.rep, message: 'ncu wrote no ncu.csv' }));
    const text = new TextDecoder().decode(data);
    const rows = parseNcuCsv(text);
    const bySymbol = new Map<string, { capture: string; rep: number }>();
    for (const s of out.step.serves) for (const sym of ctx.captures.get(s.capture)?.symbols ?? []) bySymbol.set(sym, s);
    const seen = new Map<string, Record<string, number>>();
    for (const r of rows) if (bySymbol.has(r.kernel) && !seen.has(r.kernel)) seen.set(r.kernel, r.counters);
    const obs: Observation[] = [];
    for (const [sym, s] of bySymbol) {
      const counters = seen.get(sym);
      if (counters && Object.keys(counters).length) obs.push({ type: 'kernel-counters', capture: s.capture, rep: s.rep, counters, clock: 'base' });
      else {
        const err = /ERR_NVGPUCTRPERM|==ERROR==[^\n]*/.exec(text)?.[0];
        obs.push({ type: 'error', capture: s.capture, rep: s.rep, message: `ncu profiled no launch of ${sym}${err ? `: ${err}` : ''}` });
      }
    }
    return obs;
  },
};
