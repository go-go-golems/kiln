import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { rng } from '../src/lang/util';
import type { ServerConfig } from './config';
import type { Bundle } from './importer';
import { now, type Db } from './db';
import type { EventBus } from './events';
import { getDataset } from './datasets';
import { archiveFile, getArchive } from './evidence';
import { importRepetition } from './importer';
import { runDinoRepetition } from './dino';
import { importQualification, QUALIFICATION_FORMAT, variantOf } from './qualification';
import {
  addJobEvent,
  deleteRunsOf,
  failArtifact,
  getJob,
  getJobRow,
  insertArtifact,
  insertRun,
  jobCaptures,
  setCaptureStatus,
  splitRef,
  updateJob,
  type JobCaptureRow,
} from './store';

/** How one repetition of one capture is executed on a host. */
export interface Executor {
  kind: 'process' | 'synthetic';
  /** Executes repetition `rep`; resolves with the process exit code (or 0 for synthetic). */
  run(c: JobCaptureRow, rep: number, ctx: ExecContext): Promise<{ exitCode: number | null; stderrTail: string; dir: string }>;
}

interface ExecContext {
  jobId: string;
  log: (kind: string, detail: string) => void;
  onChild: (child: ChildProcess | null) => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Runs `python -m perf_lab_local.run` in the workloads uv project: one fresh process per repetition. */
export function processExecutor(config: ServerConfig): Executor {
  return {
    kind: 'process',
    run(c, rep, ctx) {
      const base = join(config.artifactsDir, c.hash);
      const dir = join(base, `rep-${rep}`);
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      const specFile = join(base, 'spec.json');
      writeFileSync(specFile, c.spec_json);
      return new Promise((resolve) => {
        const child = spawn(config.uv, ['run', '--project', config.workloadsDir, 'python', '-m', 'perf_lab_local.run', '--spec', specFile, '--rep', String(rep), '--out', dir], {
          cwd: config.workloadsDir,
          env: { ...process.env, PYTHONUNBUFFERED: '1', PERF_LAB_INDUCTOR_CACHE: join(config.dataDir, 'inductor-cache') },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        ctx.onChild(child);
        let stderr = '';
        child.stderr.on('data', (d: Buffer) => {
          stderr = (stderr + d.toString()).slice(-8000);
        });
        createInterface({ input: child.stdout }).on('line', (line) => {
          if (!line.startsWith('{')) return; // profiler diagnostics (USDT …) are not progress
          try {
            const ev = JSON.parse(line) as { event: string; [k: string]: unknown };
            const { event, ...rest } = ev;
            ctx.log(`script.${event}`, `${c.ref}#${rep} ${JSON.stringify(rest)}`);
          } catch {
            /* a partial line is not an event */
          }
        });
        child.on('close', (code) => {
          ctx.onChild(null);
          writeFileSync(join(dir, 'stderr.log'), stderr);
          resolve({ exitCode: code, stderrTail: stderr, dir });
        });
        child.on('error', (e) => {
          ctx.onChild(null);
          resolve({ exitCode: -1, stderrTail: `${stderr}\n${e.message}`, dir });
        });
      });
    },
  };
}

/** Hosts this machine cannot reach: the capture completes as synthetic and stays labelled so. */
export const syntheticExecutor: Executor = {
  kind: 'synthetic',
  async run() {
    await sleep(150);
    return { exitCode: 0, stderrTail: '', dir: '' };
  },
};

/**
 * One job at a time, one process at a time: concurrent benchmark processes would measure each other.
 * Repetitions of different arms are interleaved in the experiment's seeded paired order.
 */
export class Runner {
  private readonly queue: string[] = [];
  private busy = false;
  private current: { jobId: string; child: ChildProcess | null } | null = null;
  private readonly cancelled = new Set<string>();

  constructor(
    private readonly db: Db,
    private readonly bus: EventBus,
    private readonly executors: Record<string, Executor>,
    /** dataDir: where evidence archives are extracted; config: for the local dino workload */
    private readonly opts: { dataDir?: string; config?: ServerConfig } = {},
  ) {}

  executorFor(host: string): Executor {
    return this.executors[host] ?? syntheticExecutor;
  }

  canExecute(host: string): boolean {
    return this.executors[host]?.kind === 'process';
  }

  enqueue(jobId: string) {
    this.queue.push(jobId);
    void this.pump();
  }

  cancel(jobId: string) {
    this.cancelled.add(jobId);
    if (this.current?.jobId === jobId) this.current.child?.kill('SIGTERM');
  }

  /** Resolves when the queue is empty; for tests and orderly shutdown. */
  async idle() {
    while (this.busy || this.queue.length) await sleep(50);
  }

  private async pump() {
    if (this.busy) return;
    this.busy = true;
    try {
      while (this.queue.length) await this.runJob(this.queue.shift()!);
    } finally {
      this.busy = false;
    }
  }

  private event(jobId: string, kind: string, detail: string) {
    const id = addJobEvent(this.db, jobId, kind, detail);
    this.bus.emit('job.event', { jobId, id, at: now(), kind, detail });
  }

  private changed(jobId: string) {
    this.bus.emit('job.updated', getJob(this.db, jobId));
  }

  /**
   * Captures declared with .evidence(archive) are not executed: their repetitions are read from the registered
   * archive's reports. Origin stays 'measured' (they were measured, on their host) and source names the archive.
   * Returns the number of repetitions imported.
   */
  private importEvidence(jobId: string, labId: string, group: JobCaptureRow[], evidence: Evidence, running: Set<string>, done: () => number, total: number): number {
    const { db } = this;
    const sha = evidence.archive_sha256;
    const dataDir = this.opts.dataDir;
    if (!dataDir) throw new Error('the runner has no data directory for evidence archives');
    if (!getArchive(db, sha)) throw new Error(`evidence archive ${sha.slice(0, 12)}… is not registered on this server (pnpm lab evidence add <file>)`);
    if (evidence.format !== QUALIFICATION_FORMAT) throw new Error(`unknown evidence format ${evidence.format}; this server reads ${QUALIFICATION_FORMAT}`);
    const source = `evidence:${sha}`;
    let n = 0;
    for (const c of group) {
      if (this.cancelled.has(jobId)) throw new Cancelled();
      const spec = JSON.parse(c.spec_json) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      const datasetId = spec.workload?.dataset_sha256 as string | undefined;
      setCaptureStatus(db, jobId, c.hash, 'running');
      this.event(jobId, 'run.started', `${c.ref} from archive ${sha.slice(0, 12)}…`);
      const bundles = importQualification({
        read: (p) => archiveFile(db, dataDir, sha, p),
        source,
        reportsDir: 'qualification/reports/',
        spec,
        hash: c.hash,
        ref: c.ref,
        host: c.host,
        dataset: datasetId ? getDataset(db, datasetId) : undefined,
      });
      if (bundles.length !== c.reps) throw new Error(`${c.ref}: the archive provides ${bundles.length} repetitions, the plan expects ${c.reps}`);
      deleteRunsOf(db, c.hash);
      const input = { hash: c.hash, ref: c.ref, host: c.host, reps: c.reps, spec };
      insertArtifact(db, labId, input, 'measured', 'running', source);
      running.add(c.hash);
      for (const b of bundles) {
        insertRun(db, c.hash, b);
        const notes = (b.run.coverage as { notes?: string[] }).notes ?? [];
        this.event(jobId, 'run.imported', `${b.run.ref}: ${b.entities.length} entities from ${String(b.run.report)}${notes.length ? ` · ${notes.join('; ')}` : ''}`);
        n++;
        updateJob(db, jobId, { progress: (done() + n) / total });
        this.changed(jobId);
      }
      insertArtifact(db, labId, input, 'measured', 'available', source);
      running.delete(c.hash);
      setCaptureStatus(db, jobId, c.hash, 'imported');
      this.event(jobId, 'artifact.imported', `${c.ref} (imported from archive ${sha.slice(0, 12)}…)`);
      this.bus.emit('artifact.imported', { hash: c.hash, ref: c.ref, origin: 'measured', source });
    }
    this.bus.emit('catalog.changed', { labId });
    return n;
  }

  /**
   * The local dino workload: a baseline and a candidate capture run together, one process per repetition, as
   * PR 1005's paired benchmark does; both arms are imported from that process's report.
   */
  private async runDino(jobId: string, labId: string, group: JobCaptureRow[], running: Set<string>, done: () => number, total: number): Promise<number> {
    const config = this.opts.config;
    if (!config) throw new Error('the runner has no server configuration for the dino workload');
    const byVariant = new Map(group.map((c) => [variantOf(JSON.parse(c.spec_json) as Record<string, unknown>, splitRef(c.ref).arm), c]));
    const base = byVariant.get('baseline');
    const cand = byVariant.get('candidate');
    if (group.length !== 2 || !base || !cand) throw new Error(`the dino workload runs a baseline and a candidate together; this group is ${group.map((c) => c.ref).join(', ')}`);
    const mode = splitRef(base.ref).mode;
    if (mode !== 'timing' && mode !== 'predictions') throw new Error(`the local dino workload records timing and predictions, not ${mode}`);
    const cap = (c: JobCaptureRow) => ({ hash: c.hash, ref: c.ref, host: c.host, spec: JSON.parse(c.spec_json) as Record<string, unknown> });
    for (const c of group) {
      setCaptureStatus(this.db, jobId, c.hash, 'running');
      deleteRunsOf(this.db, c.hash);
      insertArtifact(this.db, labId, { hash: c.hash, ref: c.ref, host: c.host, reps: c.reps, spec: cap(c).spec }, 'measured', 'running');
      running.add(c.hash);
    }
    let n = 0;
    for (let rep = 0; rep < Math.max(base.reps, cand.reps); rep++) {
      if (this.cancelled.has(jobId)) throw new Cancelled();
      this.event(jobId, 'run.started', `${base.ref} and ${cand.ref} #${rep} on local, one process`);
      const out = await runDinoRepetition(config, this.db, { baseline: cap(base), candidate: cap(cand) }, mode, rep, {
        log: (kind, detail) => this.event(jobId, kind, detail),
        onChild: (child) => {
          if (this.current) this.current.child = child;
        },
      });
      if (this.cancelled.has(jobId)) throw new Cancelled();
      for (const [c, bundle] of [[base, out.baseline], [cand, out.candidate]] as [JobCaptureRow, Bundle][]) {
        insertRun(this.db, c.hash, bundle);
        const v = bundle.run.validity as { ok: boolean; reasons: string[] };
        this.event(jobId, 'run.imported', `${bundle.run.ref}: ${bundle.entities.length} entities${v.ok ? '' : ` · invalid: ${v.reasons.join('; ')}`}`);
        n++;
        updateJob(this.db, jobId, { progress: (done() + n) / total });
      }
      this.changed(jobId);
    }
    for (const c of group) {
      insertArtifact(this.db, labId, { hash: c.hash, ref: c.ref, host: c.host, reps: c.reps, spec: cap(c).spec }, 'measured', 'available');
      running.delete(c.hash);
      setCaptureStatus(this.db, jobId, c.hash, 'imported');
      this.event(jobId, 'artifact.imported', `${c.ref} (measured on local)`);
      this.bus.emit('artifact.imported', { hash: c.hash, ref: c.ref, origin: 'measured' });
    }
    this.bus.emit('catalog.changed', { labId });
    return n;
  }

  private async runJob(jobId: string) {
    const job = getJobRow(this.db, jobId);
    if (!job || job.status !== 'approved') return;
    this.current = { jobId, child: null };
    updateJob(this.db, jobId, { status: 'running', progress: 0 });
    this.event(jobId, 'job.started', `on ${job.hosts}`);
    this.changed(jobId);
    const captures = jobCaptures(this.db, jobId);
    const total = captures.reduce((a, c) => a + c.reps, 0) || 1;
    let done = 0;
    const running = new Set<string>();
    try {
      // group arms of one experiment/mode/host so paired repetitions interleave
      const groups = new Map<string, JobCaptureRow[]>();
      for (const c of captures) {
        const k = `${c.experiment}/${c.mode}@${c.host}`;
        groups.set(k, [...(groups.get(k) ?? []), c]);
      }
      for (const group of groups.values()) {
        const spec0 = JSON.parse(group[0].spec_json) as { evidence?: Evidence | null; workload?: { adapter?: string } };
        if (spec0.evidence) {
          done += this.importEvidence(jobId, job.lab_id, group, spec0.evidence, running, () => done, total);
          continue;
        }
        if (spec0.workload?.adapter === 'dino' && this.canExecute(group[0].host)) {
          done += await this.runDino(jobId, job.lab_id, group, running, () => done, total);
          continue;
        }
        const executor = this.executorFor(group[0].host);
        const origin = executor.kind === 'process' ? 'measured' : 'synthetic';
        const asInput = (c: JobCaptureRow) => ({ hash: c.hash, ref: c.ref, host: c.host, reps: c.reps, spec: JSON.parse(c.spec_json) as Record<string, unknown> });
        for (const c of group) {
          setCaptureStatus(this.db, jobId, c.hash, 'running');
          if (executor.kind === 'process') deleteRunsOf(this.db, c.hash);
          // the artifact exists from the first repetition so its runs can reference it; the catalog lists only 'available'
          insertArtifact(this.db, job.lab_id, asInput(c), origin, 'running');
          running.add(c.hash);
        }
        const seed = Number((JSON.parse(group[0].spec_json).comparison as { paired_order_seed?: number } | undefined)?.paired_order_seed ?? 0);
        const maxReps = Math.max(...group.map((c) => c.reps));
        for (let rep = 0; rep < maxReps; rep++) {
          const order = [...group];
          const r = rng(`${seed}:${rep}`);
          for (let i = order.length - 1; i > 0; i--) {
            const j = Math.floor(r.next() * (i + 1));
            [order[i], order[j]] = [order[j], order[i]];
          }
          for (const c of order) {
            if (rep >= c.reps) continue;
            if (this.cancelled.has(jobId)) throw new Cancelled();
            this.event(jobId, 'run.started', `${c.ref}#${rep} on ${c.host}`);
            const out = await executor.run(c, rep, {
              jobId,
              log: (kind, detail) => this.event(jobId, kind, detail),
              onChild: (child) => {
                if (this.current) this.current.child = child;
              },
            });
            if (this.cancelled.has(jobId)) throw new Cancelled();
            if (executor.kind === 'process') {
              updateJob(this.db, jobId, { status: 'importing' });
              this.changed(jobId);
              const bundle = importRepetition({
                dir: out.dir,
                spec: JSON.parse(c.spec_json),
                hash: c.hash,
                ref: c.ref,
                rep,
                host: c.host,
                exitCode: out.exitCode,
                stderrTail: out.stderrTail,
              });
              insertRun(this.db, c.hash, bundle);
              const v = bundle.run.validity as { ok: boolean; reasons: string[] };
              this.event(jobId, 'run.imported', `${c.ref}#${rep}: ${bundle.entities.length} entities${v.ok ? '' : ` · invalid: ${v.reasons.join('; ')}`}`);
              if (out.exitCode !== 0) throw new Error(`${c.ref}#${rep} exited with ${out.exitCode}: ${out.stderrTail.split('\n').filter(Boolean).slice(-3).join(' | ')}`);
              updateJob(this.db, jobId, { status: 'running' });
            } else {
              this.event(jobId, 'run.done', `${c.ref}#${rep} (synthetic host: no process runs)`);
            }
            done++;
            updateJob(this.db, jobId, { progress: done / total });
            this.changed(jobId);
          }
        }
        for (const c of group) {
          insertArtifact(this.db, job.lab_id, asInput(c), origin, 'available');
          running.delete(c.hash);
          setCaptureStatus(this.db, jobId, c.hash, 'imported');
          this.event(jobId, 'artifact.imported', `${c.ref} (${origin})`);
          this.bus.emit('artifact.imported', { hash: c.hash, ref: c.ref, origin });
        }
        this.bus.emit('catalog.changed', { labId: job.lab_id });
      }
      updateJob(this.db, jobId, { status: 'done', progress: 1, finished_at: now() });
      this.event(jobId, 'job.done', `${captures.length} captures imported`);
    } catch (e) {
      const cancelled = e instanceof Cancelled;
      for (const h of running) failArtifact(this.db, h);
      for (const c of jobCaptures(this.db, jobId)) if (c.status === 'running') setCaptureStatus(this.db, jobId, c.hash, cancelled ? 'cancelled' : 'failed', cancelled ? null : (e as Error).message);
      updateJob(this.db, jobId, { status: cancelled ? 'cancelled' : 'failed', error: cancelled ? null : (e as Error).message, finished_at: now() });
      this.event(jobId, cancelled ? 'job.cancelled' : 'job.failed', cancelled ? 'cancelled by request' : (e as Error).message);
    } finally {
      this.current = null;
      this.cancelled.delete(jobId);
      this.changed(jobId);
    }
  }
}

class Cancelled extends Error {}

interface Evidence {
  archive_sha256: string;
  format: string;
  reports?: Record<string, string[]> | null;
}
