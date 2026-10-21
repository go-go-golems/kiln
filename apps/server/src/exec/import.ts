// Import (guide §23): a job's result archive in, runs, captures and records out. Every step's output directory goes
// through its kind's importer and its collectors' importers; the observations become one run bundle per repetition a
// step served (stepRuns), stored as the catalog's captures, runs and run_bundles; each kind's finish hook then projects
// records. Partial archives (a cancelled or failed job) import the same way: whatever ran is evidence.
import { collectorById, kindById, stepRuns, type Capture, type ImportContext, type Observation, type Plan, type StepExecution, type StepOutput } from '@kiln/exec';
import { VERSION } from '../config.ts';
import { get, now, run, tx, type Db } from '../db.ts';
import { pack } from '../lab/store.ts';
import { readTarGz } from '../lab/tar.ts';
import { insertRecords } from '../records.ts';
import { readNsys } from './nsys-sqlite.ts';

export interface ImportJob {
  id: string;
  host: string;
  plan: Plan;
  captures: Capture[];
  status: 'done' | 'failed' | 'cancelled';
  error: string | null;
  archive: string | null;
  /** When the driver ended the job: the records' time, so that importing the archive again makes the same records */
  endedAt: string;
}

export interface ImportResult {
  runs: number;
  captures: string[];
  records: string[];
  rejected: string[];
  /** Observations an importer could not attribute or read, as messages */
  errors: string[];
}

const dec = new TextDecoder();
const json = <T>(b: Uint8Array | undefined): T | null => {
  if (!b) return null;
  try {
    return JSON.parse(dec.decode(b)) as T;
  } catch {
    return null;
  }
};

/** The fields of a conditions snapshot the runs carry: who else was on the GPU before and after the job. */
const conditionsOf = (c: Record<string, unknown> | null) =>
  c ? { at: c.at ?? null, computeApps: c.computeApps ?? [], containers: ((c.containers as string[] | undefined) ?? []).filter((n) => !n.startsWith('kiln-')), gpu: c.gpu ?? null } : null;

export function importArchive(db: Db, job: ImportJob, archive: Uint8Array | null): ImportResult {
  const files = new Map<string, Uint8Array>();
  if (archive) for (const e of readTarGz(archive, job.plan.limits.archiveBytes + 64 * 2 ** 20)) if (e.type === 'file') files.set(e.path, e.data);
  const execution = json<{ hostname?: string; status?: string; steps?: StepExecution[] }>(files.get('execution.json'));
  const executions = new Map((execution?.steps ?? []).map((s) => [s.id, s]));
  const hostname = execution?.hostname ?? job.host;
  const captures = new Map(job.captures.map((c) => [c.id, c]));
  const ctx: ImportContext = { job: job.id, captures, readNsys };
  const conditions = { before: conditionsOf(json(files.get('conditions/before.json'))), after: conditionsOf(json(files.get('conditions/after.json'))) };
  const refOf = (c: Capture) => kindById.get(c.kind)?.lab?.(c).ref;
  const meta = { host: job.host, hostname, job: job.id, archive: job.archive, conditions, ref: (c: Capture) => refOf(c) ?? `${c.pairId}/${c.label}/${c.mode}` };

  const observations: Observation[] = [];
  const completed = new Map<string, number>();
  const bundles: ReturnType<typeof stepRuns> = [];
  const errors: string[] = [];
  const ran = job.plan.steps.filter((s) => executions.has(s.id));
  for (const step of ran) {
    const ex = executions.get(step.id)!;
    // the step a cancel killed did not fail: it is treated as never run, like the steps after it
    if (execution?.status === 'cancelled' && step === ran.at(-1) && ex.exit !== 0) continue;
    const prefix = `out/${step.id}/`;
    const out: StepOutput = {
      step, execution: ex,
      files: new Map([...files].filter(([p]) => p.startsWith(prefix)).map(([p, b]) => [p.slice(prefix.length), b])),
      log: dec.decode(files.get(`logs/${step.id}.log`) ?? new Uint8Array()),
    };
    const kind = kindById.get(step.kind);
    const obs: Observation[] = [];
    try {
      if (kind) obs.push(...kind.import(out, ctx));
      for (const id of step.collectors) obs.push(...collectorImport(id, out, ctx));
    } catch (e) {
      errors.push(`${step.id}: ${(e as Error).message}`);
    }
    observations.push(...obs);
    if (ex.exit === 0) for (const s of step.serves) completed.set(s.capture, (completed.get(s.capture) ?? 0) + 1);
    bundles.push(...stepRuns(step, ex, obs, captures, meta));
  }

  const at = now();
  const stored = new Set<string>();
  tx(db, () => {
    for (const b of bundles) {
      const c = captures.get(String(b.run.specHash))!;
      const lab = kindById.get(c.kind)?.lab?.(c);
      if (!stored.has(c.id)) {
        stored.add(c.id);
        const [experiment = '', arm = '', mode = ''] = (lab?.ref ?? `${c.pairId}/${c.label}/${c.mode}`).split('/');
        run(
          db,
          `insert into captures (hash, kind, lab_id, lab_hash, experiment, arm, mode, host, reps, spec_json, origin, status, created_at, imported_at, source, job_id)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'executed', 'available', ?, ?, ?, ?)
           on conflict (hash) do update set status = 'available', imported_at = excluded.imported_at, source = excluded.source, job_id = excluded.job_id`,
          c.id, c.kind, lab?.labId ?? null, lab?.hash ?? null, experiment, arm, mode, job.host, c.protocol.reps, JSON.stringify(c), at, at, `job:${job.id}`, job.id,
        );
      }
      const r = b.run as unknown as { rep: number; ref: string; experiment: string; arm: string; mode: string; startedAt?: string | null; durationS?: number | null };
      run(db, 'insert or replace into runs (hash, rep, ref, experiment, arm, mode, host, started_at, duration_s, run_json) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        c.id, r.rep, r.ref, r.experiment, r.arm, r.mode, job.host, r.startedAt ?? null, r.durationS ?? null, JSON.stringify(r));
      run(db, 'insert or replace into run_bundles (hash, rep, entities, links, n_entities, n_links) values (?, ?, ?, ?, ?, ?)', c.id, r.rep, pack(b.entities), pack(b.links), b.entities.length, b.links.length);
    }
  });

  const records = [];
  for (const kind of new Set(job.captures.map((c) => c.kind))) {
    const k = kindById.get(kind);
    if (!k?.finish) continue;
    const mine = job.captures.filter((c) => c.kind === kind);
    const ids = new Set(mine.map((c) => c.id));
    records.push(...k.finish({ job: job.id, host: job.host, hostname, status: job.status, error: job.error, archive: job.archive, app: VERSION, at: job.endedAt, captures: mine, observations: observations.filter((o) => ids.has(o.capture)), completed }));
  }
  const ins = insertRecords(db, records, { jobId: job.id });
  run(db, 'update devices set host = ? where id in (select device_id from records where job_id = ?)', job.host, job.id);
  return { runs: bundles.length, captures: [...stored], records: ins.ids, rejected: ins.rejected.map((r) => r.reason), errors };
}

function collectorImport(id: string, out: StepOutput, ctx: ImportContext): Observation[] {
  const c = collectorById.get(id);
  return c?.import ? c.import(out, ctx) : [];
}

/** Whether a capture identity has runs: the planner's `cached`. */
export const hasRuns = (db: Db, capture: string): boolean => !!get(db, `select 1 from captures where hash = ? and status = 'available'`, capture);
