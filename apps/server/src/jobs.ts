// CUDA jobs (guide §30.4):
//
//   proposed ──approve──► approved ──► running ──► done
//       │                    │            │  └──► failed (error; partial records kept, invalid)
//       └──cancel──► cancelled ◄──cancel──┘
//
// A job is a set of kernels and a protocol. On creation the server recomputes every kernel's content id from the
// submitted source, launch, inputs and output (409 content_id_mismatch otherwise), so a job's records name exactly
// the code that ran. Agent-proposed jobs are never created approved: only the page, holding the session token,
// approves. The queue runs one job at a time; each repetition is one runner invocation with the kernels in a seeded
// shuffled order; every kernel becomes one kiln-measure/1 record with one sample per completed repetition.
import { canonicalJSON, canonicalSource, checkSamples, contentId, median, RECORD_FORMAT, recordId, repetitionOrder, sha256Hex, type MeasurementRecord, type SampleCheck } from '@kiln/evidence';
import { VERSION } from './config.ts';
import { all, get, now, run, tx, type Db } from './db.ts';
import { cudaIdentity, type CudaIdentity, type Devices } from './devices.ts';
import type { EventBus } from './events.ts';
import type { KilnBundle, KilnResults } from './executors/types.ts';
import { insertRecords, recordIdsOfJob } from './records.ts';

export const LIMITS = { kernels: 64, reps: 64, warmup: 1000, launches: 10_000, samples: 4096, inputs: 16, numel: 2 ** 28, source: 1_000_000, reason: 2000 };

export type JobStatus = 'proposed' | 'approved' | 'running' | 'done' | 'failed' | 'cancelled';
export type Proposer = 'user' | 'agent';

export interface Activation {
  requested: string | null;
  materialized: string;
  ok: boolean;
  notes: string[];
}

/** One kernel of a job, as the page submits it (POST /jobs). */
export interface JobKernelInput {
  name: string;
  identity: string;
  row: string;
  knobs: Record<string, string | number>;
  /** The page's content id; the server recomputes it */
  contentId: string;
  /** CUDA C++ with one __global__ function */
  source: string;
  /** The entry symbol (Kiln's symbolOf); optional, but when given it must be the source's __global__ function */
  symbol?: string;
  launch: { grid: number; block: number; smem: number };
  inputs: { shape: number[]; seed: number }[];
  output: number[];
  /** Output indices the runner returns */
  samples: number[];
  /** The page's reference values at `samples` (referenceAt), null where the reference is NaN */
  expect: (number | null)[];
  /** The page's activation check (activationOf); absent means not checked */
  activation?: Activation;
}

export interface JobProtocol {
  reps: number;
  warmup: number;
  /** Timed launches per kernel per repetition */
  launches: number;
  seed: number;
}

/** What is stored: the kernels with their source replaced by its hash (the text lives in `sources`). */
interface StoredKernel extends Omit<JobKernelInput, 'source'> {
  /** sha256 of the source text: its key in the sources table */
  textSha256: string;
  /** sha256 of canonicalSource(source, symbol): what records and content ids name */
  sourceSha256: string;
}
interface StoredSpec {
  codegen: string;
  protocol: JobProtocol;
  kernels: StoredKernel[];
}

interface JobRow {
  id: string;
  status: JobStatus;
  proposed_by: Proposer;
  executor: string;
  reason: string;
  spec_json: string;
  spec_sha256: string;
  created_at: string;
  approved_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  executor_ms: number;
  error: string | null;
}

export interface JobView {
  id: string;
  status: JobStatus;
  proposedBy: Proposer;
  executor: string;
  reason: string;
  createdAt: string;
  approvedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  executorSeconds: number;
  codegen: string;
  protocol: JobProtocol;
  specSha256: string;
  kernels: { name: string; identity: string; row: string; contentId: string; launch: JobKernelInput['launch']; samples: number }[];
  /** ids of the records the job produced */
  records: string[];
  events?: { at: string; kind: string; detail: string }[];
}

export interface Reply {
  status: 200 | 201 | 400 | 403 | 404 | 409 | 429;
  body: unknown;
}

const fail = (status: Reply['status'], error: string, message: string, extra: Record<string, unknown> = {}): Reply => ({ status, body: { error, message, ...extra } });

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isInt = (x: unknown, lo: number, hi: number): x is number => Number.isInteger(x) && (x as number) >= lo && (x as number) <= hi;
const isStr = (x: unknown, max: number): x is string => typeof x === 'string' && x.length > 0 && x.length <= max;
const numel = (shape: readonly number[]) => shape.reduce((a, b) => a * b, 1);
const isShape = (x: unknown): x is number[] => Array.isArray(x) && x.length <= 8 && x.every((d) => isInt(d, 0, LIMITS.numel)) && numel(x as number[]) <= LIMITS.numel;
const secs = (ms: number) => `${+(ms / 1000).toFixed(1)} s`;
const firstLine = (s: string) => s.split('\n').find((l) => l.trim())?.slice(0, 500) ?? s.slice(0, 500);

/** The __global__ function a CUDA source defines (the runner finds it the same way, kiln_runner.py kernel_name). */
export function entrySymbol(source: string): string | null {
  return /__global__\s+void\s+(?:__launch_bounds__\s*\([^)]*\)\s*)?(\w+)\s*\(/.exec(source)?.[1] ?? null;
}

/**
 * The source hash a content id covers: the text with its entry symbol replaced by `kernel` (canonicalSource), so
 * the same code under two kernel names is one content id (Kiln's contentOf, K/src/std/records.js, does the same).
 */
const sourceHash = (source: string, symbol: string) => sha256Hex(canonicalSource(source, symbol));

/** Validate a POST /jobs body. Returns the kernels with their recomputed content ids, or the refusal. */
export function parseJob(body: unknown, executors: ReadonlySet<string>): { ok: true; executor: string; reason: string; approve: boolean; codegen: string; protocol: JobProtocol; kernels: JobKernelInput[] } | { ok: false; reply: Reply } {
  const bad = (message: string) => ({ ok: false as const, reply: fail(400, 'bad_request', message) });
  if (!isObj(body)) return bad('the body must be a JSON object');
  if (typeof body.executor !== 'string' || !executors.has(body.executor)) return { ok: false, reply: fail(400, 'unknown_executor', `no executor ${String(body.executor)} (configured: ${[...executors].join(', ') || 'none'})`) };
  if (!isStr(body.reason, LIMITS.reason)) return bad(`reason must be a non-empty string of at most ${LIMITS.reason} characters`);
  if (body.approve !== undefined && typeof body.approve !== 'boolean') return bad('approve must be a boolean');
  if (!isStr(body.codegen, 100)) return bad('codegen must name the code generator version (CODEGEN_VERSION)');
  const p = body.protocol;
  if (!isObj(p)) return bad('protocol must be {reps, warmup, launches, seed}');
  if (!isInt(p.reps, 1, LIMITS.reps)) return fail400(`protocol.reps must be an integer in 1..${LIMITS.reps}`, 'limit_exceeded', p.reps);
  if (!isInt(p.warmup, 0, LIMITS.warmup)) return bad(`protocol.warmup must be an integer in 0..${LIMITS.warmup}`);
  if (!isInt(p.launches, 1, LIMITS.launches)) return bad(`protocol.launches must be an integer in 1..${LIMITS.launches}`);
  if (!isInt(p.seed, 0, 2 ** 32 - 1)) return bad('protocol.seed must be an integer in 0..2^32-1');
  const ks = body.kernels;
  if (!Array.isArray(ks) || !ks.length) return bad('kernels must be a non-empty array');
  if (ks.length > LIMITS.kernels) return fail400(`a job runs at most ${LIMITS.kernels} kernels (got ${ks.length})`, 'limit_exceeded', ks.length);
  const kernels: JobKernelInput[] = [];
  for (let i = 0; i < ks.length; i++) {
    const k = ks[i] as Record<string, unknown>, at = `kernels[${i}]`;
    if (!isObj(k)) return bad(`${at} must be an object`);
    if (!isStr(k.name, 200)) return bad(`${at}.name must be a non-empty string`);
    if (!isStr(k.identity, 500) || !isStr(k.row, 500)) return bad(`${at}: identity and row must be non-empty strings`);
    if (!isObj(k.knobs) || !Object.values(k.knobs).every((v) => typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v)))) return bad(`${at}.knobs must map names to strings or finite numbers`);
    if (typeof k.contentId !== 'string') return bad(`${at}.contentId must be a string`);
    if (!isStr(k.source, LIMITS.source)) return bad(`${at}.source must be CUDA source of at most ${LIMITS.source} characters`);
    const l = k.launch;
    if (!isObj(l) || !isInt(l.grid, 1, 2 ** 31 - 1) || !isInt(l.block, 1, 1024) || !isInt(l.smem, 0, 1 << 20)) return bad(`${at}.launch must be {grid ≥ 1, block in 1..1024, smem ≥ 0}`);
    if (!Array.isArray(k.inputs) || k.inputs.length > LIMITS.inputs || !k.inputs.every((x) => isObj(x) && isShape(x.shape) && isInt(x.seed, 0, 2 ** 32 - 1))) return bad(`${at}.inputs must be at most ${LIMITS.inputs} {shape, seed} with integer seeds`);
    if (!isShape(k.output) || numel(k.output) < 1) return bad(`${at}.output must be a non-empty shape`);
    const n = numel(k.output);
    if (!Array.isArray(k.samples) || !k.samples.length || k.samples.length > LIMITS.samples || !k.samples.every((s) => isInt(s, 0, n - 1))) return bad(`${at}.samples must be 1..${LIMITS.samples} output indices in 0..${n - 1}`);
    if (!Array.isArray(k.expect) || k.expect.length !== k.samples.length || !k.expect.every((v) => v === null || (typeof v === 'number' && Number.isFinite(v)))) return bad(`${at}.expect must hold one reference value (or null for NaN) per sample index`);
    const a = k.activation;
    if (a !== undefined && !(isObj(a) && (a.requested === null || typeof a.requested === 'string') && typeof a.materialized === 'string' && typeof a.ok === 'boolean' && Array.isArray(a.notes) && a.notes.every((x) => typeof x === 'string'))) return bad(`${at}.activation must be {requested, materialized, ok, notes}`);
    const input = k as unknown as JobKernelInput;
    const symbol = entrySymbol(input.source);
    if (!symbol) return bad(`${at}.source has no __global__ function`);
    if (k.symbol !== undefined && k.symbol !== symbol) return bad(`${at}.symbol is ${String(k.symbol)}, but the source's __global__ function is ${symbol}`);
    const got = contentId({ codegen: body.codegen, lang: 'cuda', sourceSha256: sourceHash(input.source, symbol), launch: { grid: input.launch.grid, block: input.launch.block, smem: input.launch.smem }, inputs: input.inputs, output: input.output, target: null });
    if (got !== input.contentId) return { ok: false, reply: fail(409, 'content_id_mismatch', `${at} (${input.name}): the submitted source, launch, inputs and output hash to ${got}, not ${input.contentId}`, { kernel: i, name: input.name, expected: got, got: input.contentId }) };
    kernels.push({
      name: input.name, symbol, identity: input.identity, row: input.row, knobs: { ...input.knobs }, contentId: got, source: input.source,
      launch: { grid: input.launch.grid, block: input.launch.block, smem: input.launch.smem },
      inputs: input.inputs.map((x) => ({ shape: [...x.shape], seed: x.seed })), output: [...input.output], samples: [...input.samples], expect: [...input.expect],
      ...(a ? { activation: { requested: input.activation!.requested, materialized: input.activation!.materialized, ok: input.activation!.ok, notes: [...input.activation!.notes] } } : {}),
    });
  }
  return { ok: true, executor: body.executor, reason: body.reason, approve: body.approve === true, codegen: body.codegen, protocol: { reps: p.reps, warmup: p.warmup, launches: p.launches, seed: p.seed }, kernels };

  function fail400(message: string, code: string, got: unknown) {
    return { ok: false as const, reply: fail(400, code, message, { got }) };
  }
}

interface Acc {
  samples: number[];
  raw: number[][];
  position: number[];
  errors: string[];
  checks: SampleCheck[];
}

export interface JobsOptions {
  repTimeoutMs: number;
  agentBudgetSec: number;
}

export class Jobs {
  private readonly db: Db;
  private readonly bus: EventBus;
  private readonly devices: Devices;
  private readonly opts: JobsOptions;
  private active: { id: string; controller: AbortController; done: Promise<void> } | null = null;

  constructor(db: Db, bus: EventBus, devices: Devices, opts: JobsOptions) {
    this.db = db;
    this.bus = bus;
    this.devices = devices;
    this.opts = opts;
  }

  /** At start-up: a job left running by a previous process cannot be resumed. Returns how many were failed. */
  failInterrupted(): number {
    return Number(run(this.db, `update jobs set status = 'failed', finished_at = ?, error = 'interrupted: the server stopped while the job was running' where status = 'running'`, now()).changes);
  }

  /** Executor milliseconds agent-proposed jobs spent in the last 24 hours. */
  agentUsedMs(): number {
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    return get<{ ms: number }>(this.db, `select coalesce(sum(executor_ms), 0) as ms from jobs where proposed_by = 'agent' and started_at >= ?`, since)?.ms ?? 0;
  }

  create(body: unknown, proposer: string | undefined): Reply {
    if (proposer !== 'user' && proposer !== 'agent') return fail(400, 'bad_proposer', 'X-Kiln-Proposer must be "user" or "agent"');
    const p = parseJob(body, new Set(this.devices.executors.keys()));
    if (!p.ok) return p.reply;
    if (proposer === 'agent' && p.approve) return fail(403, 'agent_cannot_approve', 'an agent-proposed job waits for the user to approve it in the Jobs view');
    if (proposer === 'agent' && this.agentUsedMs() >= this.opts.agentBudgetSec * 1000) return fail(429, 'agent_budget_exhausted', `agent-proposed jobs have used their ${this.opts.agentBudgetSec} executor seconds for the last 24 hours`);
    const id = `job-${crypto.randomUUID()}`;
    const spec: StoredSpec = {
      codegen: p.codegen,
      protocol: p.protocol,
      kernels: p.kernels.map(({ source, ...k }) => ({ ...k, textSha256: sha256Hex(source), sourceSha256: sourceHash(source, k.symbol!) })),
    };
    const json = canonicalJSON(spec);
    const at = now();
    tx(this.db, () => {
      for (const k of p.kernels) run(this.db, 'insert or ignore into sources (sha256, lang, text) values (?, ?, ?)', sha256Hex(k.source), 'cuda', k.source);
      run(this.db, `insert into jobs (id, status, proposed_by, executor, reason, spec_json, spec_sha256, created_at, approved_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, p.approve ? 'approved' : 'proposed', proposer, p.executor, p.reason, json, sha256Hex(json), at, p.approve ? at : null);
    });
    this.event(id, 'proposed', `${p.kernels.length} kernel${p.kernels.length === 1 ? '' : 's'} × ${p.protocol.reps} repetitions on ${p.executor}, proposed by the ${proposer}`);
    if (p.approve) this.event(id, 'approved', 'approved on creation');
    this.updated(id);
    this.kick();
    return { status: 201, body: this.view(id) };
  }

  approve(id: string): Reply {
    const job = this.row(id);
    if (!job) return fail(404, 'not_found', `no job ${id}`);
    if (job.status !== 'proposed') return fail(409, 'bad_state', `a ${job.status} job cannot be approved`);
    run(this.db, `update jobs set status = 'approved', approved_at = ? where id = ?`, now(), id);
    this.event(id, 'approved', 'approved');
    this.updated(id);
    this.kick();
    return { status: 200, body: this.view(id) };
  }

  async cancel(id: string): Promise<Reply> {
    const job = this.row(id);
    if (!job) return fail(404, 'not_found', `no job ${id}`);
    if (job.status === 'proposed' || job.status === 'approved') {
      run(this.db, `update jobs set status = 'cancelled', finished_at = ? where id = ?`, now(), id);
      this.event(id, 'cancelled', `cancelled while ${job.status}`);
      this.updated(id);
      return { status: 200, body: this.view(id) };
    }
    if (job.status === 'running' && this.active?.id === id) {
      const active = this.active;
      active.controller.abort(new Error('cancelled by the user'));
      // the runner's process group is killed; wait (bounded) for the job to record its end
      await Promise.race([active.done, new Promise((r) => setTimeout(r, 10_000).unref())]);
      return { status: 200, body: this.view(id) };
    }
    return fail(409, 'bad_state', `a ${job.status} job cannot be cancelled`);
  }

  /** Start the oldest approved job unless one is running. */
  kick(): void {
    if (this.active) return;
    const next = get<{ id: string }>(this.db, `select id from jobs where status = 'approved' order by approved_at, created_at limit 1`);
    if (!next) return;
    const controller = new AbortController();
    const done = this.execute(next.id, controller)
      .catch((e: unknown) => {
        run(this.db, `update jobs set status = 'failed', finished_at = ?, error = ? where id = ?`, now(), `internal error: ${(e as Error).message}`, next.id);
        this.event(next.id, 'failed', `internal error: ${(e as Error).message}`);
        this.updated(next.id);
      })
      .finally(() => {
        this.active = null;
        this.kick();
      });
    this.active = { id: next.id, controller, done };
  }

  /** Resolves when no job is running or waiting (tests). */
  async idle(): Promise<void> {
    while (this.active) await this.active.done;
  }

  private async execute(id: string, controller: AbortController): Promise<void> {
    const job = this.row(id)!;
    const spec = JSON.parse(job.spec_json) as StoredSpec;
    const executor = this.devices.executors.get(job.executor);
    run(this.db, `update jobs set status = 'running', started_at = ? where id = ?`, now(), id);
    this.event(id, 'running', `on ${job.executor}`);
    this.updated(id);
    if (!executor) return this.finish(id, 'failed', `executor ${job.executor} is no longer configured`, []);

    const sources = spec.kernels.map((k) => get<{ text: string }>(this.db, 'select text from sources where sha256 = ?', k.textSha256)?.text ?? '');
    const { reps, warmup, launches, seed } = spec.protocol;
    const n = spec.kernels.length;
    const acc: Acc[] = spec.kernels.map(() => ({ samples: [], raw: [], position: [], errors: [], checks: [] }));
    let identity: CudaIdentity | null = null, runner: string | null = null, error: string | null = null, cancelled = false, completed = 0;

    for (let rep = 0; rep < reps; rep++) {
      if (controller.signal.aborted) {
        cancelled = true;
        break;
      }
      const budget = `the agents' budget of ${this.opts.agentBudgetSec} executor seconds per 24 hours is spent`;
      let timeoutMs = this.opts.repTimeoutMs, byBudget = false;
      if (job.proposed_by === 'agent') {
        const left = this.opts.agentBudgetSec * 1000 - this.agentUsedMs();
        if (left <= 0) {
          error = budget;
          break;
        }
        byBudget = left < timeoutMs;
        timeoutMs = Math.min(timeoutMs, left);
      }
      const order = repetitionOrder(n, seed, rep);
      const bundle: KilnBundle = {
        format: 'kiln-bundle/1', reps: launches, warmup, ncu: false,
        kernels: order.map((i) => {
          const k = spec.kernels[i]!;
          return { name: k.name, identity: k.identity, row: k.row, source: sources[i]!, grid: k.launch.grid, block: k.launch.block, smem: k.launch.smem, inputs: k.inputs.map((x) => ({ size: numel(x.shape), seed: x.seed })), out: numel(k.output), samples: k.samples };
        }),
      };
      const timeout = AbortSignal.timeout(timeoutMs);
      const t0 = performance.now();
      let res: KilnResults | null = null;
      try {
        res = await executor.runRepetition(bundle, AbortSignal.any([controller.signal, timeout]), (line) => this.event(id, 'runner', line));
      } catch (e) {
        if (controller.signal.aborted) cancelled = true;
        else if (timeout.aborted) error = byBudget ? `repetition ${rep + 1} of ${reps} stopped: ${budget}` : `repetition ${rep + 1} of ${reps} timed out after ${secs(timeoutMs)}`;
        else error = `repetition ${rep + 1} of ${reps}: ${firstLine((e as Error).message)}`;
      } finally {
        run(this.db, 'update jobs set executor_ms = executor_ms + ? where id = ?', Math.round(performance.now() - t0), id);
      }
      if (!res) break;

      const ident = cudaIdentity(res.device ?? {}, executor.host);
      if (identity && identity.id !== ident.id) {
        error = `the device changed between repetitions (${identity.id}, then ${ident.id})`;
        break;
      }
      identity = ident;
      runner = typeof res.runner === 'string' ? res.runner : runner;
      if (res.kernels.length !== n) {
        error = `repetition ${rep + 1} of ${reps}: the runner returned ${res.kernels.length} results for ${n} kernels`;
        break;
      }
      let ok = 0;
      order.forEach((i, position) => {
        const k = spec.kernels[i]!, r = res.kernels[position], a = acc[i]!;
        if (r?.name !== k.name) return void a.errors.push(`repetition ${rep}: the result at position ${position} is for ${String(r?.name)}, not ${k.name}`);
        if (r.error) return void a.errors.push(`repetition ${rep}: ${firstLine(String(r.error))}`);
        const times = (r.us_all ?? []).filter((t) => typeof t === 'number' && Number.isFinite(t) && t >= 0);
        if (!times.length) return void a.errors.push(`repetition ${rep}: no timed launch completed`);
        a.samples.push(median(times)!);
        a.raw.push(times);
        a.position.push(position);
        a.checks.push(checkSamples(Array.isArray(r.samples) ? r.samples.map(Number) : [], k.expect));
        ok++;
      });
      completed++;
      this.event(id, 'repetition', `repetition ${rep + 1} of ${reps}: ${ok} of ${n} kernels ran`);
      this.updated(id);
    }

    const status: JobStatus = cancelled ? 'cancelled' : error ? 'failed' : 'done';
    let ids: string[] = [];
    if (identity) {
      this.devices.reached(executor.id, identity);
      const at = now();
      const records = spec.kernels.flatMap((k, i) => (status === 'done' || acc[i]!.samples.length ? [jobRecord({ job: id, spec, k, a: acc[i]!, identity: identity!, runner, host: executor.host, status, error, completed, at })] : []));
      const ins = insertRecords(this.db, records, { jobId: id });
      if (ins.rejected.length) error = [error, `${ins.rejected.length} records failed validation: ${ins.rejected[0]!.reason}`].filter(Boolean).join('; ');
      ids = ins.ids;
      if (ids.length) this.bus.emit('records.added', { job: id, device: identity.id, ids });
    }
    this.finish(id, status, error, ids);
  }

  private finish(id: string, status: JobStatus, error: string | null, ids: string[]): void {
    run(this.db, 'update jobs set status = ?, finished_at = ?, error = ? where id = ?', status, now(), error, id);
    this.event(id, status, error ?? `${ids.length} record${ids.length === 1 ? '' : 's'}`);
    this.updated(id);
  }

  private row(id: string): JobRow | undefined {
    return get<JobRow>(this.db, 'select * from jobs where id = ?', id);
  }

  private event(id: string, kind: string, detail: string): void {
    const at = now(), text = detail.slice(0, 2000);
    run(this.db, 'insert into job_events (job_id, at, kind, detail) values (?, ?, ?, ?)', id, at, kind, text);
    this.bus.emit('job.event', { job: id, at, kind, detail: text });
  }

  private updated(id: string): void {
    this.bus.emit('job.updated', this.view(id, { events: false }));
  }

  view(id: string, { events = true }: { events?: boolean } = {}): JobView | null {
    const j = this.row(id);
    return j ? this.toView(j, events) : null;
  }

  list(): JobView[] {
    return all<JobRow>(this.db, 'select * from jobs order by created_at desc, id limit 200').map((j) => this.toView(j, false));
  }

  private toView(j: JobRow, events: boolean): JobView {
    const spec = JSON.parse(j.spec_json) as StoredSpec;
    return {
      id: j.id, status: j.status, proposedBy: j.proposed_by, executor: j.executor, reason: j.reason,
      createdAt: j.created_at, approvedAt: j.approved_at, startedAt: j.started_at, finishedAt: j.finished_at, error: j.error,
      executorSeconds: j.executor_ms / 1000, codegen: spec.codegen, protocol: spec.protocol, specSha256: j.spec_sha256,
      kernels: spec.kernels.map((k) => ({ name: k.name, identity: k.identity, row: k.row, contentId: k.contentId, launch: k.launch, samples: k.samples.length })),
      records: recordIdsOfJob(this.db, j.id),
      ...(events ? { events: all<{ at: string; kind: string; detail: string }>(this.db, 'select at, kind, detail from job_events where job_id = ? order by id', j.id) } : {}),
    };
  }
}

/** One kernel's kiln-measure/1 record, following the rules of K/src/std/records.js makeRecord. */
function jobRecord(o: { job: string; spec: StoredSpec; k: StoredKernel; a: Acc; identity: CudaIdentity; runner: string | null; host: string; status: JobStatus; error: string | null; completed: number; at: string }): MeasurementRecord {
  const { k, a, spec } = o;
  const { reps, seed, launches, warmup } = spec.protocol;
  const failed = a.checks.find((c) => !c.ok);
  const check: MeasurementRecord['check'] = { ok: a.checks.length > 0 && !failed, sampled: k.samples.length };
  const maxAbs = a.checks.length ? Math.max(...a.checks.map((c) => c.maxAbs)) : NaN;
  if (Number.isFinite(maxAbs)) check.maxAbsErr = maxAbs;
  check.detail = failed ? failed.message : a.checks.length ? a.checks[0]!.message : `not run: ${a.errors[0] ?? 'no repetition completed'}`;
  const activation: Activation = k.activation ?? { requested: null, materialized: k.row, ok: true, notes: ['activation not checked: the job spec carried none'] };

  const reasons: string[] = [];
  for (const e of a.errors) reasons.push(`repetition error: ${e}`);
  if (failed) reasons.push(`output check: ${failed.message}`);
  else if (!a.checks.length && !a.errors.length) reasons.push('output check: no repetition completed');
  if (!activation.ok) reasons.push(`activation: requested ${activation.requested}, materialised ${activation.materialized}`);
  if (a.samples.length !== reps) reasons.push(`small n: ${a.samples.length} of ${reps} repetitions completed`);
  if (o.status === 'failed') reasons.push(`job failed: ${o.error}`);
  if (o.status === 'cancelled') reasons.push(`job cancelled after ${o.completed} of ${reps} repetitions`);

  const rec: Omit<MeasurementRecord, 'id'> = {
    format: RECORD_FORMAT, at: o.at, by: 'job',
    device: { id: o.identity.id, class: 'cuda', name: o.identity.name, fingerprint: { ...o.identity.fingerprint } },
    kernel: { name: k.name, identity: k.identity, row: k.row, knobs: { ...k.knobs }, contentId: k.contentId, lang: 'cuda', sourceSha256: k.sourceSha256, launch: { ...k.launch } },
    timing: { kind: 'cuda-events', unit: 'us', samples: a.samples, launches, warmup, raw: a.raw },
    check,
    activation: { requested: activation.requested, materialized: activation.materialized, ok: activation.ok, notes: [...activation.notes] },
    validity: { ok: !reasons.length, reasons, partial: [] },
    protocol: { reps, seed, position: a.position, pairId: o.job },
    manifest: { codegen: spec.codegen, app: VERSION, ...(o.runner ? { runner: o.runner } : {}), host: o.host },
  };
  return { ...rec, id: recordId(rec) } as MeasurementRecord;
}
