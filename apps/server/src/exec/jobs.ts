// Jobs (guide §24): one job API for every kind of work. A job is a list of captures on one host; the planner turns
// it into a kiln-plan/1, and the host's driver runs it.
//
//   proposed ──approve──► approved ──(driver starts it)──► running ──► importing ──► done
//       │                    │                                │            └──► failed (an importer refused)
//       └──cancel──► cancelled ◄────────cancel────────────────┤
//                                                             └──► failed (driver failed, lock timeout, restart)
//
// The queue is the driver's: one job at a time per host, hosts concurrently, and two servers sharing a host are
// serialised by the same queue. The server follows each submitted job by long-polling its events from the last
// stored sequence number, so a restarted server picks up where it left off. Partial archives are imported too.
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJSON, sha256Hex } from '@kiln/evidence';
import { kindById, planJob, type Capture, type CaptureVerdict, type DriverEvent, type Plan } from '@kiln/exec';
import { all, get, now, run, tx, type Db } from '../db.ts';
import type { EventBus } from '../events.ts';
import { writeFileAtomic } from '../lab/files.ts';
import { readTarGz } from '../lab/tar.ts';
import { recordIdsOfJob } from '../records.ts';
import { DriverError } from './driver-client.ts';
import type { Hosts } from './hosts.ts';
import { hasRuns, importArchive, type ImportResult } from './import.ts';

export type JobStatus = 'proposed' | 'approved' | 'running' | 'importing' | 'done' | 'failed' | 'cancelled';
export type Proposer = 'user' | 'agent';

export interface Reply {
  status: 200 | 201 | 202 | 400 | 403 | 404 | 409 | 429 | 503;
  body: unknown;
}

interface JobRow {
  id: string;
  status: JobStatus;
  proposed_by: Proposer;
  host: string;
  reason: string;
  spec_json: string;
  spec_sha256: string;
  plan_sha256: string | null;
  plan_steps: number;
  archive_sha256: string | null;
  result_json: string | null;
  created_at: string;
  approved_at: string | null;
  submitted_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  executor_ms: number;
  driver_seq: number;
  error: string | null;
}

interface Spec {
  protocol: Capture['protocol'];
  captures: Capture[];
}

export interface JobCaptureView {
  seq: number;
  index: number | null;
  capture: string | null;
  kind: string;
  pairId: string;
  mode: string;
  collectors: string[];
  label: string;
  verdict: CaptureVerdict['verdict'];
  reason: string | null;
}

export interface JobView {
  id: string;
  status: JobStatus;
  proposedBy: Proposer;
  host: string;
  reason: string;
  createdAt: string;
  approvedAt: string | null;
  submittedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  executorSeconds: number;
  protocol: Capture['protocol'];
  specSha256: string;
  planSha256: string | null;
  archive: string | null;
  captures: JobCaptureView[];
  groups: number;
  steps: number;
  records: string[];
  runs?: { capture: string; rep: number; ref: string }[];
  events?: { at: string; kind: string; detail: string }[];
}

export interface JobsConfig {
  dataDir: string;
  agentBudgetSec: number;
  /** Server files kinds stage, by asset name */
  asset(name: string): Uint8Array;
  /** Long-poll wait per events request, seconds */
  pollWaitS?: number;
}

const fail = (status: Reply['status'], error: string, message: string, extra: Record<string, unknown> = {}): Reply => ({ status, body: { error, message, ...extra } });
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const MAX_REASON = 2000;

/** One driver event as a sentence for the job's event list. */
export function describe(e: DriverEvent): string {
  const s = (x: unknown) => String(x ?? '');
  switch (e.type) {
    case 'job.queued': return `queued on the driver at position ${s(e.position)}`;
    case 'driver.started': return `the driver started the job (driver ${s(e.driver).slice(0, 12)}, pid ${s(e.pid)})`;
    case 'lock.waiting': {
      const h = e.holder as { job?: string; since?: string } | null;
      return `waiting for the GPU lock${h?.job ? ` held by ${h.job} since ${h.since}` : ''} (${s(e.waited)} s so far)`;
    }
    case 'lock.acquired': return `GPU lock acquired after ${s(e.waited)} s`;
    case 'conditions': return `${s(e.when)}: ${plural(Number(e.computeApps ?? 0), 'other CUDA process')}, ${plural(Number(e.containers ?? 0), 'other container')}${e.utilizationPct !== null && e.utilizationPct !== undefined ? `, GPU ${s(e.utilizationPct)} % busy` : ''}`;
    case 'step.started': return `${s(e.step)} started`;
    case 'step.output': return `${s(e.step)}: ${s(e.line)}`;
    case 'step.refused': return `${s(e.step)} refused: the plan expects image ${s(e.planned).slice(0, 19)}, the host has ${s(e.found ?? 'none').slice(0, 19)}`;
    case 'step.finished': return `${s(e.step)} ${e.timedOut ? 'timed out' : `exited with ${s(e.exit)}`} after ${s(e.seconds)} s, ${s(e.outputBytes)} bytes of output${e.dropped ? ` (dropped ${(e.dropped as string[]).join(', ')})` : ''}`;
    case 'job.cancelled': return `cancelled while ${s(e.phase)}`;
    case 'driver.failed': return `driver failed: ${s(e.reason)}`;
    case 'result': return `result: ${s(e.status)}${e.error ? ` (${s(e.error)})` : ''}, archive ${e.sha256 ? `${s(e.sha256).slice(0, 12)}, ${s(e.bytes)} bytes${e.partial ? ', partial' : ''}` : 'none'}`;
    default: return JSON.stringify(e);
  }
}

export class Jobs {
  private readonly db: Db;
  private readonly bus: EventBus;
  private readonly hosts: Hosts;
  private readonly cfg: JobsConfig;
  private readonly followers = new Map<string, Promise<void>>();
  private readonly submitting = new Map<string, Promise<unknown>>();
  private readonly stop = new AbortController();

  constructor(db: Db, bus: EventBus, hosts: Hosts, cfg: JobsConfig) {
    this.db = db;
    this.bus = bus;
    this.hosts = hosts;
    this.cfg = cfg;
    for (const d of ['blobs', 'plans', 'archives']) mkdirSync(join(cfg.dataDir, d), { recursive: true });
  }

  /** Executor milliseconds agent-proposed jobs spent in the last 24 hours. */
  agentUsedMs(): number {
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    return get<{ ms: number }>(this.db, `select coalesce(sum(executor_ms), 0) as ms from jobs where proposed_by = 'agent' and created_at >= ?`, since)?.ms ?? 0;
  }

  async create(body: unknown, proposer: string | undefined): Promise<Reply> {
    if (proposer !== 'user' && proposer !== 'agent') return fail(400, 'bad_proposer', 'X-Kiln-Proposer must be "user" or "agent"');
    if (!isObj(body)) return fail(400, 'bad_request', 'the body must be a JSON object');
    const hostId = body.host;
    if (typeof hostId !== 'string' || !this.hosts.profile(hostId)) return fail(400, 'unknown_host', `no host ${String(hostId)} (configured: ${this.hosts.ids().join(', ') || 'none'})`);
    const dryRun = body.dryRun === true;
    if (!dryRun && !(typeof body.reason === 'string' && body.reason.trim() && body.reason.length <= MAX_REASON)) return fail(400, 'bad_request', `reason must be a non-empty string of at most ${MAX_REASON} characters`);
    if (body.approve !== undefined && typeof body.approve !== 'boolean') return fail(400, 'bad_request', 'approve must be a boolean');
    const approve = body.approve === true;
    if (proposer === 'agent' && approve) return fail(403, 'agent_cannot_approve', 'an agent-proposed job waits for the user to approve it in the Jobs view');
    if (!dryRun && proposer === 'agent' && this.agentUsedMs() >= this.cfg.agentBudgetSec * 1000) return fail(429, 'agent_budget_exhausted', `agent-proposed jobs have used their ${this.cfg.agentBudgetSec} executor seconds for the last 24 hours`);

    let caps;
    try {
      caps = await this.hosts.capabilities(hostId);
    } catch (e) {
      return fail(503, 'host_unreachable', `cannot plan on ${hostId}: ${(e as Error).message}`);
    }
    const id = `job-${crypto.randomUUID()}`;
    const out = planJob({ job: id, host: this.hosts.profile(hostId)!, facts: caps.facts, kinds: kindById, protocol: body.protocol, captures: body.captures, asset: this.cfg.asset, cached: (c) => hasRuns(this.db, c) });
    if (!out.ok) return fail(out.refusal.status, out.refusal.error, out.refusal.message, out.refusal.extra);
    const summary = { host: hostId, verdicts: out.verdicts, groups: out.groups.length, steps: out.plan?.steps.length ?? 0, environments: Object.keys(out.plan?.environments ?? {}), files: out.plan?.files.length ?? 0 };
    if (dryRun) return { status: 200, body: { dryRun: true, ...summary, plan: out.plan } };
    if (!out.plan) return fail(409, 'nothing_to_execute', 'every capture is cached or blocked', summary);

    const plan = out.plan;
    for (const [, bytes] of out.files) {
      const sha = sha256Hex(bytes);
      const f = join(this.cfg.dataDir, 'blobs', sha);
      if (!existsSync(f)) writeFileAtomic(f, bytes);
    }
    const planJson = canonicalJSON(plan);
    writeFileAtomic(join(this.cfg.dataDir, 'plans', `${id}.json`), new TextEncoder().encode(planJson));
    const spec: Spec = { protocol: out.captures[0]?.protocol ?? (body.protocol as Spec['protocol']), captures: out.captures };
    const specJson = JSON.stringify(spec);
    const at = now();
    const byId = new Map(out.captures.map((c) => [c.id, c]));
    tx(this.db, () => {
      run(this.db, `insert into jobs (id, status, proposed_by, host, reason, spec_json, spec_sha256, plan_sha256, plan_steps, created_at, approved_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, approve ? 'approved' : 'proposed', proposer, hostId, String(body.reason), specJson, sha256Hex(specJson), sha256Hex(planJson), plan.steps.length, at, approve ? at : null);
      out.verdicts.forEach((v, seq) => {
        run(this.db, 'insert into job_captures (job_id, seq, idx, capture, kind, pair_id, mode, collectors_json, label, verdict, reason) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          id, seq, v.index, v.capture ?? null, v.kind, v.pairId, v.mode, JSON.stringify(v.collectors), v.label, v.verdict, v.reason ?? (v.capture && byId.get(v.capture)?.companion ? 'timing companion of a counters capture' : null));
      });
    });
    const n = out.verdicts.filter((v) => v.verdict === 'execute').length;
    this.event(id, 'proposed', `${plural(n, 'capture')} in ${plural(out.groups.length, 'group')}, ${plural(plan.steps.length, 'step')} on ${hostId}, proposed by the ${proposer}`);
    if (approve) this.event(id, 'approved', 'approved on creation');
    this.updated(id);
    if (approve) this.follow(id);
    return { status: 201, body: this.view(id) };
  }

  approve(id: string): Reply {
    const job = this.row(id);
    if (!job) return fail(404, 'not_found', `no job ${id}`);
    if (job.status !== 'proposed') return fail(409, 'bad_state', `a ${job.status} job cannot be approved`);
    run(this.db, `update jobs set status = 'approved', approved_at = ? where id = ?`, now(), id);
    this.event(id, 'approved', 'approved');
    this.updated(id);
    this.follow(id);
    return { status: 200, body: this.view(id) };
  }

  async cancel(id: string): Promise<Reply> {
    const job = this.row(id);
    if (!job) return fail(404, 'not_found', `no job ${id}`);
    if (job.status === 'proposed' || (job.status === 'approved' && !job.submitted_at)) {
      this.finish(id, 'cancelled', null, `cancelled while ${job.status}`);
      return { status: 200, body: this.view(id) };
    }
    if (job.status === 'approved' || job.status === 'running') {
      try {
        await this.hosts.client(job.host).cancel(id);
      } catch (e) {
        return fail(503, 'host_unreachable', `cannot reach ${job.host} to cancel: ${(e as Error).message}`);
      }
      this.event(id, 'cancel', 'cancel requested');
      // the driver ends the job with a partial archive; wait (bounded) for the import
      const f = this.followers.get(id);
      if (f) await Promise.race([f, new Promise((r) => setTimeout(r, 15_000).unref())]);
      return { status: 200, body: this.view(id) };
    }
    return fail(409, 'bad_state', `a ${job.status} job cannot be cancelled`);
  }

  /** Imports the stored archive again with the current importers (records are content-addressed: no duplicates). */
  reimport(id: string): Reply {
    const job = this.row(id);
    if (!job) return fail(404, 'not_found', `no job ${id}`);
    if (!job.archive_sha256) return fail(409, 'no_archive', `job ${id} has no stored archive`);
    if (!['done', 'failed', 'cancelled'].includes(job.status)) return fail(409, 'bad_state', `a ${job.status} job cannot be imported again`);
    const r = this.importStored(job);
    this.event(id, 'reimported', `${plural(r.runs, 'run')}, ${plural(r.records.length, 'new record')}`);
    this.updated(id);
    return { status: 200, body: this.view(id) };
  }

  /** At start-up: follow every job a driver may hold, and import archives a previous process fetched but did not import. */
  resume(): number {
    const open = all<{ id: string }>(this.db, `select id from jobs where status in ('approved', 'running', 'importing') order by created_at`);
    for (const j of open) this.follow(j.id);
    return open.length;
  }

  /** Resolves when no job is being followed (tests). */
  async idle(): Promise<void> {
    while (this.followers.size) await Promise.allSettled([...this.followers.values()]);
  }

  close(): void {
    this.stop.abort();
  }

  // ── following a job on its driver ─────────────────────────────────────────────────────────────────────────────

  private follow(id: string): void {
    if (this.followers.has(id)) return;
    const p = this.drive(id)
      .catch((e: unknown) => {
        if (this.stop.signal.aborted) return;
        this.finish(id, 'failed', null, `internal error: ${(e as Error).message}`);
      })
      .finally(() => this.followers.delete(id));
    this.followers.set(id, p);
  }

  private async drive(id: string): Promise<void> {
    let job = this.row(id)!;
    const client = this.hosts.client(job.host);
    if (job.status === 'importing' && job.archive_sha256) return this.complete(job, readFileSync(this.archivePath(job.archive_sha256)));

    if (job.status === 'approved' && !job.submitted_at && !(await this.serial(job.host, () => this.submit(id)))) return;

    let quiet = 0;
    for (;;) {
      if (this.stop.signal.aborted) return;
      job = this.row(id)!;
      let res: { events: DriverEvent[]; state: string };
      try {
        res = await client.events(id, job.driver_seq, this.cfg.pollWaitS ?? 25, this.stop.signal);
        if (quiet) this.event(id, 'driver', `${job.host} answers again`);
        quiet = 0;
      } catch (e) {
        if (this.stop.signal.aborted) return;
        if (e instanceof DriverError && e.status === 404) return this.finish(id, 'failed', null, `${job.host}'s driver does not know the job (its root was cleared?)`);
        if (!quiet) this.event(id, 'driver', `${job.host} is unreachable; retrying: ${(e as Error).message}`);
        quiet++;
        await new Promise((r) => setTimeout(r, Math.min(30_000, 1000 * 2 ** Math.min(quiet, 5))).unref());
        continue;
      }
      let result: DriverEvent | null = null;
      for (const ev of res.events) {
        tx(this.db, () => {
          run(this.db, 'update jobs set driver_seq = ? where id = ? and driver_seq < ?', ev.seq, id, ev.seq);
          if (ev.type === 'driver.started') run(this.db, `update jobs set status = 'running', started_at = ? where id = ? and status = 'approved'`, ev.at, id);
          if (ev.type === 'step.finished' && typeof ev.seconds === 'number') run(this.db, 'update jobs set executor_ms = executor_ms + ? where id = ?', Math.round(ev.seconds * 1000), id);
        });
        if (ev.type !== 'step.output' || this.outputLines(id) < 400) this.event(id, ev.type, describe(ev), ev.at);
        if (ev.type === 'driver.started' || ev.type === 'step.finished') this.updated(id);
        if (ev.type === 'result') result = ev;
      }
      if (job.proposed_by === 'agent' && !result && !job.error && this.row(id)!.status === 'running' && this.agentUsedMs() >= this.cfg.agentBudgetSec * 1000) {
        // the error marks the cancel as the budget's: the job ends failed with it (outcome)
        const why = `the agents' budget of ${this.cfg.agentBudgetSec} executor seconds per 24 hours is spent`;
        run(this.db, 'update jobs set error = ? where id = ?', why, id);
        this.event(id, 'budget', `${why}: cancelling`);
        await client.cancel(id).catch(() => undefined);
      }
      if (result) return this.collect(this.row(id)!, result);
    }
  }

  /** Submissions to one host go one at a time, so that its driver queues jobs in the order they were approved. */
  private serial<T>(host: string, f: () => Promise<T>): Promise<T> {
    const p = (this.submitting.get(host) ?? Promise.resolve()).then(f);
    this.submitting.set(host, p.catch(() => undefined));
    return p;
  }

  /** Stages the plan's files on the driver and submits the plan; false when the job did not reach the driver. */
  private async submit(id: string): Promise<boolean> {
    const job = this.row(id)!;
    const client = this.hosts.client(job.host);
    const plan = JSON.parse(readFileSync(join(this.cfg.dataDir, 'plans', `${id}.json`), 'utf8')) as Plan;
    try {
      const caps = await this.hosts.capabilities(job.host);
      const changed = Object.entries(plan.environments).filter(([name, e]) => caps.facts.environments[name]?.image !== e.image);
      if (changed.length) {
        const [name] = changed[0]!;
        run(this.db, `update jobs set status = 'proposed', approved_at = null where id = ?`, id);
        this.event(id, 'replan', `environment ${name} on ${job.host} changed since the plan was made: propose the job again`);
        this.updated(id);
        return false;
      }
      for (const f of plan.files) if (!(await client.hasBlob(f.sha256))) await client.putBlob(f.sha256, readFileSync(join(this.cfg.dataDir, 'blobs', f.sha256)));
      const r = await client.submit(plan);
      run(this.db, 'update jobs set submitted_at = ? where id = ?', now(), id);
      this.event(id, 'submitted', `submitted to ${job.host}${r.known ? ' (the driver already had it)' : ''}`);
      this.updated(id);
      return true;
    } catch (e) {
      this.finish(id, 'failed', null, `submitting to ${job.host} failed: ${(e as Error).message}`);
      return false;
    }
  }

  private outputLines(id: string): number {
    return get<{ n: number }>(this.db, `select count(*) as n from job_events where job_id = ? and kind = 'step.output'`, id)?.n ?? 0;
  }

  /** The result event arrived: fetch the archive, keep it, import it, and let the driver forget the job. */
  private async collect(job: JobRow, result: DriverEvent): Promise<void> {
    const client = this.hosts.client(job.host);
    run(this.db, `update jobs set status = 'importing', result_json = ? where id = ?`, JSON.stringify(result), job.id);
    this.updated(job.id);
    let archive: Uint8Array | null = null;
    if (typeof result.sha256 === 'string') {
      try {
        archive = await client.archive(job.id);
        const got = sha256Hex(archive);
        if (got !== result.sha256) throw new Error(`the archive hashes to ${got}, the driver announced ${result.sha256}`);
        writeFileAtomic(this.archivePath(got), archive);
        this.registerArchive(job.id, got, archive);
        run(this.db, 'update jobs set archive_sha256 = ? where id = ?', got, job.id);
      } catch (e) {
        this.event(job.id, 'archive', `fetching the archive failed: ${(e as Error).message}`);
        archive = null;
      }
    }
    await this.complete(this.row(job.id)!, archive);
    if (archive || typeof result.sha256 !== 'string') await client.remove(job.id).catch(() => undefined);
  }

  /** How the job ended: the driver's result, except that a cancel the agents' budget forced is a failure with its reason. */
  private outcome(job: JobRow): { status: 'done' | 'failed' | 'cancelled'; error: string | null } {
    const result = JSON.parse(job.result_json ?? '{}') as { status?: string; error?: string | null };
    const status = (['done', 'failed', 'cancelled'].includes(String(result.status)) ? result.status : 'failed') as 'done' | 'failed' | 'cancelled';
    if (status === 'cancelled') return job.error ? { status: 'failed', error: job.error } : { status, error: null };
    return { status, error: status === 'done' ? null : (result.error ?? 'the driver ended the job failed') };
  }

  private async complete(job: JobRow, archive: Uint8Array | null): Promise<void> {
    const { status, error } = this.outcome(job);
    let r: ImportResult;
    try {
      r = this.importStored(job, archive);
    } catch (e) {
      return this.finish(job.id, 'failed', null, `import failed: ${(e as Error).message}`);
    }
    const parts = [plural(r.runs, 'run'), plural(r.records.length, 'record')];
    if (r.rejected.length) parts.push(`${plural(r.rejected.length, 'record')} rejected: ${r.rejected[0]}`);
    if (r.errors.length) parts.push(`import errors: ${r.errors.slice(0, 2).join('; ')}`);
    this.finish(job.id, status, error, parts.join(', '));
  }

  private importStored(job: JobRow, bytes?: Uint8Array | null): ImportResult {
    const archive = bytes !== undefined ? bytes : job.archive_sha256 ? readFileSync(this.archivePath(job.archive_sha256)) : null;
    const spec = JSON.parse(job.spec_json) as Spec;
    const plan = JSON.parse(readFileSync(join(this.cfg.dataDir, 'plans', `${job.id}.json`), 'utf8')) as Plan;
    const endedAt = (JSON.parse(job.result_json ?? '{}') as { at?: string }).at ?? job.finished_at ?? now();
    const r = importArchive(this.db, { id: job.id, host: job.host, plan, captures: spec.captures, ...this.outcome(job), archive: job.archive_sha256, endedAt }, archive);
    if (r.records.length) {
      this.bus.emit('records.added', { job: job.id, ids: r.records });
      // the device the records name now belongs to this host: a host's first records give its page device an evidence id
      for (const d of all<{ device_id: string }>(this.db, 'select distinct device_id from records where job_id = ?', job.id)) this.bus.emit('device.updated', { id: d.device_id, host: job.host });
    }
    if (r.runs) this.bus.emit('catalog.changed', { job: job.id, captures: r.captures });
    return r;
  }

  private archivePath(sha: string): string {
    return join(this.cfg.dataDir, 'archives', `${sha}.tar.gz`);
  }

  /** A job's archive is listed with the evidence archives (GET /archives), without extracting it. */
  private registerArchive(jobId: string, sha: string, data: Uint8Array): void {
    const files = readTarGz(data, 2 ** 31).filter((e) => e.type === 'file').map((e) => ({ path: e.path, bytes: e.data.byteLength }));
    run(this.db, 'insert or ignore into archives (sha256, name, bytes, files_json, added_at, job_id) values (?, ?, ?, ?, ?, ?)', sha, `result of ${jobId}`, data.byteLength, JSON.stringify(files), now(), jobId);
  }

  private finish(id: string, status: JobStatus, error: string | null, detail: string): void {
    run(this.db, 'update jobs set status = ?, finished_at = ?, error = ? where id = ?', status, now(), error, id);
    this.event(id, status, error ? `${error}${detail ? `; ${detail}` : ''}` : detail);
    this.updated(id);
  }

  // ── views ───────────────────────────────────────────────────────────────────────────────────────────────────────

  private row(id: string): JobRow | undefined {
    return get<JobRow>(this.db, 'select * from jobs where id = ?', id);
  }

  private event(id: string, kind: string, detail: string, at = now()): void {
    const text = detail.slice(0, 2000);
    run(this.db, 'insert into job_events (job_id, at, kind, detail) values (?, ?, ?, ?)', id, at, kind, text);
    this.bus.emit('job.event', { job: id, at, kind, detail: text });
  }

  private updated(id: string): void {
    this.bus.emit('job.updated', this.view(id, { detail: false }));
  }

  plan(id: string): Plan | null {
    const f = join(this.cfg.dataDir, 'plans', `${id}.json`);
    return this.row(id) && existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as Plan) : null;
  }

  view(id: string, { detail = true }: { detail?: boolean } = {}): JobView | null {
    const j = this.row(id);
    return j ? this.toView(j, detail) : null;
  }

  list(): JobView[] {
    return all<JobRow>(this.db, 'select * from jobs order by created_at desc, id limit 200').map((j) => this.toView(j, false));
  }

  private toView(j: JobRow, detail: boolean): JobView {
    const spec = JSON.parse(j.spec_json) as Spec;
    const caps = all<{ seq: number; idx: number | null; capture: string | null; kind: string; pair_id: string; mode: string; collectors_json: string; label: string; verdict: CaptureVerdict['verdict']; reason: string | null }>(
      this.db, 'select * from job_captures where job_id = ? order by seq', j.id);
    return {
      id: j.id, status: j.status, proposedBy: j.proposed_by, host: j.host, reason: j.reason,
      createdAt: j.created_at, approvedAt: j.approved_at, submittedAt: j.submitted_at, startedAt: j.started_at, finishedAt: j.finished_at, error: j.error,
      executorSeconds: j.executor_ms / 1000, protocol: spec.protocol, specSha256: j.spec_sha256, planSha256: j.plan_sha256, archive: j.archive_sha256,
      captures: caps.map((c) => ({ seq: c.seq, index: c.idx, capture: c.capture, kind: c.kind, pairId: c.pair_id, mode: c.mode, collectors: JSON.parse(c.collectors_json) as string[], label: c.label, verdict: c.verdict, reason: c.reason })),
      groups: new Set(spec.captures.map((c) => `${c.kind}|${c.collectors.join(',')}|${c.pairId}`)).size,
      steps: j.plan_steps,
      records: recordIdsOfJob(this.db, j.id),
      ...(detail
        ? {
            runs: all<{ hash: string; rep: number; ref: string }>(this.db, 'select r.hash, r.rep, r.ref from runs r join captures c on c.hash = r.hash where c.job_id = ? order by r.ref, r.rep', j.id).map((r) => ({ capture: r.hash, rep: r.rep, ref: r.ref })),
            events: all<{ at: string; kind: string; detail: string }>(this.db, 'select at, kind, detail from job_events where job_id = ? order by id', j.id),
          }
        : {}),
    };
  }
}
