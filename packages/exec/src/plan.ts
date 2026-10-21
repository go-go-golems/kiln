// The planner (guide §22.2): captures in, a kiln-plan/1 out. Every capture is accepted by its kind (which recomputes
// its content id), checked against the host's offers, grouped with the captures it must be compared with, and lowered
// per repetition; groups and the captures inside them follow the protocol's seeded order in every repetition.
import { repetitionOrder, sha256Hex } from '@kiln/evidence';
import { collectorById, MODES, modeCollectors, modeOf } from './collectors/index.ts';
import { captureId, deviceKey } from './identity.ts';
import type { Capture, CaptureGroup, CaptureRequest, Facts, HostProfile, Plan, PlanEnvironment, Protocol, Step } from './model.ts';
import { collectorsVerdict, collectorVerdict, kindOffer } from './offers.ts';
import { environmentBlock, type PlanContext, type Refusal, type WorkloadKind } from './registry.ts';

export const PLAN_LIMITS = { captures: 256, group: 64, reps: 64, warmup: 1000, launches: 10_000, archiveBytes: 2 ** 30, minFreeDiskBytes: 5 * 2 ** 30, stepOutput: 64 * 2 ** 20 };

export interface CaptureVerdict {
  /** Index in the request's captures, or null for a capture the planner added */
  index: number | null;
  kind: string;
  label: string;
  mode: string;
  pairId: string;
  collectors: string[];
  verdict: 'execute' | 'cached' | 'blocked';
  reason?: string;
  capture?: string;
}

export interface PlanInput {
  job: string;
  host: HostProfile;
  facts: Facts;
  kinds: ReadonlyMap<string, WorkloadKind>;
  protocol: unknown;
  captures: unknown;
  /** Server files kinds stage, by name */
  asset(name: string): Uint8Array;
  /** Whether a capture id already has runs (lab plans skip those unless rerun) */
  cached?(id: string): boolean;
}

export interface PlanOutput {
  /** null when nothing is left to execute */
  plan: Plan | null;
  /** Captures that execute, including companions */
  captures: Capture[];
  groups: CaptureGroup[];
  verdicts: CaptureVerdict[];
  /** Bundle files by path */
  files: Map<string, Uint8Array>;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isInt = (x: unknown, lo: number, hi: number): x is number => Number.isInteger(x) && (x as number) >= lo && (x as number) <= hi;
const refuse = (status: 400 | 409, error: string, message: string, extra?: Record<string, unknown>): { ok: false; refusal: Refusal } => ({ ok: false, refusal: { status, error, message, ...(extra ? { extra } : {}) } });
const THREAD_ENV: Record<string, string> = { omp: 'OMP_NUM_THREADS', mkl: 'MKL_NUM_THREADS', openblas: 'OPENBLAS_NUM_THREADS', inductorCompile: 'TORCHINDUCTOR_COMPILE_THREADS' };

export function parseProtocol(p: unknown): { ok: true; protocol: Protocol } | { ok: false; refusal: Refusal } {
  if (!isObj(p)) return refuse(400, 'bad_request', 'protocol must be {reps, launches, warmup, seed}');
  if (!isInt(p.reps, 1, PLAN_LIMITS.reps)) return refuse(400, 'limit_exceeded', `protocol.reps must be an integer in 1..${PLAN_LIMITS.reps}`, { got: p.reps });
  const launches = p.launches ?? 1, warmup = p.warmup ?? 0;
  if (!isInt(launches, 1, PLAN_LIMITS.launches)) return refuse(400, 'bad_request', `protocol.launches must be an integer in 1..${PLAN_LIMITS.launches}`);
  if (!isInt(warmup, 0, PLAN_LIMITS.warmup)) return refuse(400, 'bad_request', `protocol.warmup must be an integer in 0..${PLAN_LIMITS.warmup}`);
  if (!isInt(p.seed, 0, 2 ** 32 - 1)) return refuse(400, 'bad_request', 'protocol.seed must be an integer in 0..2^32-1');
  return { ok: true, protocol: { reps: p.reps, launches, warmup, seed: p.seed } };
}

export function planJob(input: PlanInput): ({ ok: true } & PlanOutput) | { ok: false; refusal: Refusal } {
  const { host, facts, kinds } = input;
  const pp = parseProtocol(input.protocol);
  if (!pp.ok) return pp;
  const protocol = pp.protocol;
  const reqs = input.captures;
  if (!Array.isArray(reqs) || !reqs.length) return refuse(400, 'bad_request', 'captures must be a non-empty array');
  if (reqs.length > PLAN_LIMITS.captures) return refuse(400, 'limit_exceeded', `a job holds at most ${PLAN_LIMITS.captures} captures (got ${reqs.length})`, { got: reqs.length });
  const gpu = facts.gpus.find((g) => g.index === host.gpu) ?? facts.gpus[0];
  const device = deviceKey(gpu);
  const verdicts: CaptureVerdict[] = [];
  const execute: { c: Capture; envName: string }[] = [];

  const build = (kind: WorkloadKind, collectors: string[], mode: string, pairId: string, accepted: { input: unknown; contentId: string; label: string; symbols: string[] }, rerun: boolean, index: number | null) => {
    const offer = kindOffer(kind, host, facts);
    const v = collectorsVerdict(kind, collectors, offer, host, facts);
    const base: Omit<CaptureVerdict, 'verdict'> = { index, kind: kind.id, label: accepted.label, mode, pairId, collectors };
    if ('blocked' in offer) return void verdicts.push({ ...base, verdict: 'blocked', reason: offer.blocked });
    if (!v.ok) return void verdicts.push({ ...base, verdict: 'blocked', reason: v.reason });
    const environment = environmentBlock(offer.environment, host, facts, collectors);
    const id = captureId({ kind: kind.id, contentId: accepted.contentId, collectors, protocol, device, environment });
    const c: Capture = { id, kind: kind.id, pairId, mode, collectors, input: accepted.input, contentId: accepted.contentId, label: accepted.label, symbols: accepted.symbols, protocol, device, environment, rerun, ...(index === null ? { companion: true as const } : {}) };
    if (!rerun && input.cached?.(id)) return void verdicts.push({ ...base, verdict: 'cached', capture: id });
    if (execute.some((x) => x.c.id === id)) return void verdicts.push({ ...base, verdict: 'cached', capture: id, reason: 'the same capture is already in this job' });
    verdicts.push({ ...base, verdict: 'execute', capture: id });
    execute.push({ c, envName: offer.environment });
  };

  /** A mode's collectors without the optional ones this host does not offer for the kind */
  const offered = (kind: WorkloadKind, ids: string[]) => {
    const offer = kindOffer(kind, host, facts);
    return ids.filter((id) => !collectorById.get(id)!.optional || collectorVerdict(kind, collectorById.get(id)!, offer, host, facts).ok);
  };

  for (let i = 0; i < reqs.length; i++) {
    const r = reqs[i] as CaptureRequest, at = `captures[${i}]`;
    if (!isObj(r)) return refuse(400, 'bad_request', `${at} must be an object`);
    const kind = kinds.get(String(r.kind));
    if (!kind) return refuse(400, 'unknown_kind', `${at}.kind: no workload kind ${String(r.kind)} (known: ${[...kinds.keys()].join(', ')})`);
    if (r.pairId !== undefined && !(typeof r.pairId === 'string' && /^[A-Za-z0-9_.:-]{1,100}$/.test(r.pairId))) return refuse(400, 'bad_request', `${at}.pairId must be 1..100 letters, digits, '_', '.', ':' or '-'`);
    if (r.rerun !== undefined && typeof r.rerun !== 'boolean') return refuse(400, 'bad_request', `${at}.rerun must be a boolean`);
    let collectors: string[];
    if (r.collectors !== undefined) {
      if (!Array.isArray(r.collectors) || !r.collectors.length || !r.collectors.every((c) => typeof c === 'string' && collectorById.has(c))) return refuse(400, 'bad_request', `${at}.collectors must name known collectors (${[...collectorById.keys()].join(', ')})`);
      collectors = [...new Set(r.collectors as string[])].sort();
    } else {
      const m = modeCollectors(kind, r.mode ?? 'timing');
      if (!m) return refuse(400, 'bad_request', `${at}.mode: ${kind.id} has no mode ${String(r.mode)} (${Object.keys(MODES).filter((x) => modeCollectors(kind, x)).join(', ')})`);
      collectors = offered(kind, m);
    }
    const accepted = kind.accept(r.input, `${at}.input`);
    if (!accepted.ok) return { ok: false, refusal: { status: accepted.status, error: accepted.error, message: accepted.message, extra: { capture: i, ...(accepted.extra ?? {}) } } };
    build(kind, collectors, modeOf(kind, collectors), r.pairId ?? input.job, accepted, r.rerun === true, i);
  }

  // counters never travel alone (guide §20.3): a counters capture brings the timing capture of the same content
  for (const { c } of [...execute]) {
    if (!c.collectors.includes('ncu')) continue;
    const kind = kinds.get(c.kind)!;
    const timing = offered(kind, modeCollectors(kind, 'timing')!);
    const has = execute.some((x) => x.c.kind === c.kind && x.c.contentId === c.contentId && x.c.pairId === c.pairId && x.c.collectors.join(',') === timing.join(','));
    if (!has) build(kind, timing, 'timing', c.pairId, { input: c.input, contentId: c.contentId, label: c.label, symbols: c.symbols }, c.rerun, null);
  }

  // groups: same kind, collector set and pairId
  const groups: (CaptureGroup & { k: WorkloadKind })[] = [];
  for (const { c, envName } of execute) {
    const key = `${c.kind}|${c.collectors.join(',')}|${c.pairId}`;
    let g = groups.find((x) => `${x.kind}|${x.collectors.join(',')}|${x.pairId}` === key);
    if (!g) groups.push((g = { key: `g${groups.length}`, kind: c.kind, collectors: c.collectors, pairId: c.pairId, environment: envName, protocol, captures: [], k: kinds.get(c.kind)! }));
    g.captures.push(c);
  }
  for (const g of groups) if (g.captures.length > PLAN_LIMITS.group) return refuse(400, 'limit_exceeded', `a group runs at most ${PLAN_LIMITS.group} captures (${g.kind} ${g.pairId} has ${g.captures.length})`, { got: g.captures.length });
  const files = new Map<string, Uint8Array>();
  const captures = execute.map((x) => x.c);
  const verdictsOut = verdicts;
  if (!groups.length) return { ok: true, plan: null, captures, groups: [], verdicts: verdictsOut, files };

  const steps: Step[] = [];
  for (let rep = 0; rep < protocol.reps; rep++) {
    for (const gi of repetitionOrder(groups.length, protocol.seed, rep)) {
      const g = groups[gi]!;
      const ctx = planContext(input, g.k, g.environment, files);
      const order = repetitionOrder(g.captures.length, protocol.seed, rep);
      g.k.lower(g, rep, ctx, order).forEach((d, n) => {
        let step: Step = {
          id: `${g.key}-r${rep}-${n}`, serves: d.serves, environment: g.environment, argv: d.argv, wrap: [], env: { ...(d.env ?? {}) }, mounts: [...(d.mounts ?? [])],
          user: d.user ?? 'host-user', sidecars: [], timeoutSeconds: d.timeoutSeconds, maxOutputBytes: d.maxOutputBytes ?? PLAN_LIMITS.stepOutput, kind: g.kind, collectors: g.collectors,
        };
        // in-process collectors first, wrappers last: a wrapper is the outermost process
        const ordered = [...g.collectors].sort((a, b) => Number(collectorById.get(a)!.shape === 'wrapper') - Number(collectorById.get(b)!.shape === 'wrapper'));
        for (const id of ordered) step = collectorById.get(id)!.apply(step, ctx);
        steps.push(step);
      });
    }
  }

  const environments: Record<string, PlanEnvironment> = {};
  for (const g of groups) {
    const p = host.environments[g.environment]!;
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(p.threads ?? {})) if (THREAD_ENV[k]) env[THREAD_ENV[k]] = String(v);
    environments[g.environment] = { image: facts.environments[g.environment]!.image!, ref: p.image, python: p.python, docker: { ...p.docker }, env };
  }
  const plan: Plan = {
    format: 'kiln-plan/1', job: input.job, host: host.id, driver: { sha256: facts.driver.sha256 }, environments,
    gpu: gpu ? { index: gpu.index, uuid: gpu.uuid } : null,
    lock: gpu ? { waitSeconds: host.lock.waitSeconds } : null,
    idleWindowSeconds: host.idleWindowSeconds,
    limits: { archiveBytes: PLAN_LIMITS.archiveBytes, minFreeDiskBytes: PLAN_LIMITS.minFreeDiskBytes },
    files: [...files].map(([path, bytes]) => ({ path, sha256: sha256Hex(bytes) })).sort((a, b) => (a.path < b.path ? -1 : 1)),
    steps,
  };
  return { ok: true, plan, captures, groups: groups.map(({ k: _k, ...g }) => g), verdicts: verdictsOut, files };
}

function planContext(input: PlanInput, kind: WorkloadKind, environment: string, files: Map<string, Uint8Array>): PlanContext {
  return {
    job: input.job, kind, host: input.host, facts: input.facts, environment,
    asset: input.asset,
    stage(path, bytes) {
      if (!/^[A-Za-z0-9_][A-Za-z0-9_./-]*$/.test(path) || path.split('/').includes('..')) throw new Error(`bad bundle path ${path}`);
      const prev = files.get(path);
      if (prev && sha256Hex(prev) !== sha256Hex(bytes)) throw new Error(`two different files staged at ${path}`);
      files.set(path, bytes);
      return `/job/in/${path}`;
    },
    tool(name) {
      const t = input.facts.environments[environment]?.tools?.[name];
      if (!t?.ok || !t.bin) return null;
      return { bin: t.bin, mount: t.from?.startsWith('mount:') ? t.from.slice('mount:'.length) : null };
    },
  };
}
