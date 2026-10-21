// Runs and their entities (guide §23.2): one run per repetition of a capture, built from the observations of the step
// that served it, in the entity model the lab boards read (Perf Lab's bundles: a run entity, entities, links).
import { NCU_METRICS } from './collectors/ncu.ts';
import type { Capture, Observation, Step, StepExecution } from './model.ts';

export interface RunBundle {
  run: Record<string, unknown> & { kind: 'run'; id: string; ref: string };
  entities: (Record<string, unknown> & { kind: string; id: string; ref: string })[];
  links: { from: string; to: string; rel: string; evidence: string; method?: string }[];
}

export interface RunMeta {
  host: string;
  hostname: string;
  job: string;
  archive: string | null;
  /** Conditions for every run of the job: co-tenants before and after */
  conditions: Record<string, unknown>;
  /** The experiment/arm/mode a capture's runs are named by (default captureRef) */
  ref?: (c: Capture) => string;
}

const SAFE = (s: string) => s.replace(/[^A-Za-z0-9_.=-]+/g, '_').slice(0, 120) || '_';

/** A capture's ref in the lab's experiment/arm/mode form. */
export const captureRef = (c: Pick<Capture, 'pairId' | 'label' | 'mode'>): string => `${SAFE(c.pairId)}/${SAFE(c.label)}/${SAFE(c.mode)}`;

const UNIT: Record<string, string> = { ncu_duration_us: 'us', ncu_registers: 'registers', ncu_ld_sectors: 'sectors', ncu_ld_requests: 'requests', ncu_ld_sectors_per_req: 'sectors/request', ncu_smem_bank_conflicts: 'conflicts' };
const value = (v: number, metric: string) => ({ __value: true, value: v, prov: 'observed', unit: UNIT[metric] ?? (metric.endsWith('_pct') ? '%' : ''), method: 'Nsight Compute (base clocks)', metric: NCU_METRICS[metric] ?? metric });

/** One bundle per (capture, repetition) the step served. */
export function stepRuns(step: Step, execution: StepExecution | null, observations: readonly Observation[], captures: ReadonlyMap<string, Capture>, meta: RunMeta): RunBundle[] {
  return step.serves.flatMap(({ capture, rep }) => {
    const c = captures.get(capture);
    if (!c) return [];
    const ref = meta.ref?.(c) ?? captureRef(c);
    const [experiment = SAFE(c.pairId), arm = SAFE(c.label)] = ref.split('/');
    const runRef = `${ref}#${rep}`;
    const mine = observations.filter((o) => o.capture === capture && o.rep === rep);
    const entities: RunBundle['entities'] = [];
    const links: RunBundle['links'] = [];
    const refOf = (local: string) => (local.startsWith('kiln:') ? local : `${runRef}!${local}`);
    const add = (e: Record<string, unknown> & { kind: string; id: string }) => entities.push({ ...e, ref: `${runRef}!${e.kind}:${e.id}`, run: runRef, arm, rep });
    const reasons: string[] = [];
    let fields: Record<string, unknown> = {};
    for (const o of mine) {
      if (o.type === 'entities') {
        if (o.run) fields = { ...fields, ...o.run };
        for (const e of o.entities) add(e as Record<string, unknown> & { kind: string; id: string });
        for (const l of o.links) links.push({ ...l, from: refOf(l.from), to: refOf(l.to) });
      } else if (o.type === 'kernel-launches') {
        const sorted = [...o.us].sort((a, b) => a - b);
        const med = sorted[sorted.length >> 1]!;
        const k = { kind: 'kernel', id: c.symbols[0] ?? c.label, name: c.symbols[0] ?? c.label, lane: 'gpu:isolated', start: 0, end: med * 1e3, dur: med / 1e3, launches: o.us.length, usMedian: med, usMin: sorted[0], regs: o.regs, position: o.position };
        add(k);
        const identity = (c.input as { identity?: string }).identity;
        if (identity) links.push({ from: `${runRef}!kernel:${k.id}`, to: `kiln:identity:${identity}`, rel: 'corresponds_to', evidence: 'direct', method: 'kiln-kernels/1 capture of this identity' });
      } else if (o.type === 'kernel-counters') {
        add({ kind: 'kernel', id: `${c.symbols[0] ?? c.label}-counters`, name: c.symbols[0] ?? c.label, lane: 'gpu:ncu', metrics: Object.fromEntries(Object.entries(o.counters).map(([k, v]) => [k, value(v, k)])), clock: o.clock });
      } else if (o.type === 'error') reasons.push(o.message);
    }
    if (execution?.refused) reasons.push(`step refused: ${execution.refused}`);
    if (execution?.timedOut) reasons.push(`step timed out after ${execution.seconds} s`);
    if (execution && execution.exit !== 0 && execution.exit !== undefined && !execution.refused) reasons.push(`step exited with ${execution.exit}`);
    const kindValidity = fields.validity as { ok?: boolean; reasons?: string[] } | undefined;
    for (const r of kindValidity?.reasons ?? []) if (!reasons.includes(r)) reasons.push(r);
    const run = {
      clock: c.collectors.includes('nsys') ? 'CUPTI (nsys)' : 'CUDA events',
      ...fields,
      kind: 'run' as const, id: runRef, ref: runRef, run: runRef,
      experiment, arm, mode: c.mode, rep, specHash: c.id, host: meta.host, workload: c.kind,
      manifest: { ...(fields.manifest as Record<string, unknown> | undefined), kind: c.kind, host: meta.host, hostname: meta.hostname, environment: c.environment, collectors: c.collectors, device: c.device, job: meta.job, archive: meta.archive, step: step.id, contentId: c.contentId, captureId: c.id },
      validity: { ok: !reasons.length, reasons },
      coverage: (fields.coverage as Record<string, unknown> | undefined) ?? { complete: !reasons.length, trace: { lost: [] }, source: { missing: [] }, counters: { unsupported: [] }, links: { missing: [] } },
      startedAt: (fields.startedAt as string | null | undefined) ?? execution?.startedAt ?? null,
      durationS: (fields.durationS as number | null | undefined) ?? execution?.seconds ?? null,
      stepSeconds: execution?.seconds ?? null,
      exit: execution?.exit ?? null,
      conditions: meta.conditions,
      requests: (fields.requests as number | undefined) ?? 0,
      measured: true,
      synthetic: false,
    };
    return [{ run, entities, links }];
  });
}
