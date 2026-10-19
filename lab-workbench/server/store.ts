import { pack, unpack } from './bundles';
import { all, get, now, run, tx, type Db } from './db';
import type { Bundle } from './importer';

export type Origin = 'synthetic' | 'measured';
export type JobStatus = 'proposed' | 'approved' | 'running' | 'importing' | 'done' | 'failed' | 'cancelled';

export interface CaptureInput {
  hash: string;
  /** experiment/arm/mode */
  ref: string;
  host: string;
  reps: number;
  spec: Record<string, unknown>;
}

export interface ArtifactRow {
  hash: string;
  lab_id: string;
  experiment: string;
  arm: string;
  mode: string;
  host: string;
  reps: number;
  origin: Origin;
  status: 'running' | 'available' | 'failed';
  created_at: string;
  imported_at: string | null;
  source: string | null;
}

export const splitRef = (ref: string) => {
  const [experiment, arm, mode] = ref.split('/');
  return { experiment, arm, mode };
};

// ── programs ──────────────────────────────────────────────────────────────────────────────

export const getProgram = (db: Db, labId: string) =>
  get<{ lab_id: string; source: string; preset_hash: string | null; updated_at: string }>(db, 'select * from programs where lab_id = ?', labId);

export function putProgram(db: Db, labId: string, source: string, presetHash: string | null) {
  run(
    db,
    `insert into programs (lab_id, source, preset_hash, updated_at) values (?, ?, ?, ?)
     on conflict (lab_id) do update set source = excluded.source, preset_hash = excluded.preset_hash, updated_at = excluded.updated_at`,
    labId,
    source,
    presetHash,
    now(),
  );
}

export const deleteProgram = (db: Db, labId: string) => run(db, 'delete from programs where lab_id = ?', labId);

// ── artifacts, runs and bundles ───────────────────────────────────────────────────────────

export const listArtifacts = (db: Db) =>
  all<ArtifactRow>(db, 'select hash, lab_id, experiment, arm, mode, host, reps, origin, status, created_at, imported_at, source from artifacts');

/** `source` is null for captures a lab job executed and `evidence:<sha256>` for captures imported from an archive. */
export function insertArtifact(db: Db, labId: string, c: CaptureInput, origin: Origin, status: ArtifactRow['status'] = 'available', source: string | null = null) {
  const { experiment, arm, mode } = splitRef(c.ref);
  const at = now();
  return run(
    db,
    `insert into artifacts (hash, lab_id, experiment, arm, mode, host, reps, spec_json, origin, status, created_at, imported_at, source)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     on conflict (hash) do update set status = excluded.status, origin = excluded.origin, imported_at = excluded.imported_at, source = excluded.source`,
    c.hash,
    labId,
    experiment,
    arm,
    mode,
    c.host,
    c.reps,
    JSON.stringify(c.spec),
    origin,
    status,
    at,
    status === 'available' ? at : null,
    source,
  ).changes;
}

/** Record default-parameter synthetic captures; hosts with a real executor are never seeded. */
export function seedSynthetic(db: Db, labId: string, captures: CaptureInput[], executable: (host: string) => boolean): number {
  let n = 0;
  tx(db, () => {
    for (const c of captures) {
      if (executable(c.host)) continue;
      // evidence-backed captures exist only once their archive is imported, never as synthetic stand-ins
      if (c.spec.evidence) continue;
      if (get(db, 'select 1 from artifacts where hash = ?', c.hash)) continue;
      n += insertArtifact(db, labId, c, 'synthetic') as number;
    }
  });
  return n;
}

/** A repetition's run row is only written once it is imported. */
export function insertRun(db: Db, hash: string, bundle: Bundle) {
  const r = bundle.run;
  tx(db, () => {
    run(
      db,
      `insert into runs (ref, hash, rep, experiment, arm, mode, host, started_at, duration_s, run_json) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict (hash, rep) do update set ref = excluded.ref, run_json = excluded.run_json, started_at = excluded.started_at, duration_s = excluded.duration_s`,
      r.ref,
      hash,
      Number(r.rep),
      String(r.experiment),
      String(r.arm),
      String(r.mode),
      String(r.host),
      (r.startedAt as string | null) ?? null,
      (r.durationS as number | null) ?? null,
      JSON.stringify(r),
    );
    run(
      db,
      `insert into run_bundles (hash, rep, entities, links, n_entities, n_links) values (?, ?, ?, ?, ?, ?)
       on conflict (hash, rep) do update set entities = excluded.entities, links = excluded.links, n_entities = excluded.n_entities, n_links = excluded.n_links`,
      hash,
      Number(r.rep),
      pack(bundle.entities),
      pack(bundle.links),
      bundle.entities.length,
      bundle.links.length,
    );
  });
}

export function bundlesFor(db: Db, hash: string): Bundle[] {
  const rows = all<{ run_json: string; entities: Uint8Array; links: Uint8Array }>(
    db,
    'select r.run_json, b.entities, b.links from runs r join run_bundles b on b.hash = r.hash and b.rep = r.rep where r.hash = ? order by r.rep',
    hash,
  );
  return rows.map((r) => ({ run: JSON.parse(r.run_json), entities: unpack(r.entities), links: unpack(r.links) }));
}

export const failArtifact = (db: Db, hash: string) => run(db, `update artifacts set status = 'failed' where hash = ? and status = 'running'`, hash);

/** Runs of one hash replaced by a re-run: old repetitions must not mix with new ones. */
export const deleteRunsOf = (db: Db, hash: string) => run(db, 'delete from runs where hash = ?', hash);

// ── jobs ──────────────────────────────────────────────────────────────────────────────────

export interface JobRow {
  id: string;
  lab_id: string;
  status: JobStatus;
  proposed_by: 'user' | 'assistant';
  reason: string;
  hosts: string;
  budget_gpu_min: number;
  progress: number;
  created_at: string;
  approved_at: string | null;
  finished_at: string | null;
  error: string | null;
}

export interface JobCaptureRow {
  job_id: string;
  hash: string;
  ref: string;
  experiment: string;
  arm: string;
  mode: string;
  host: string;
  reps: number;
  spec_json: string;
  status: string;
  error: string | null;
}

export interface JobView extends JobRow {
  captures: (Omit<JobCaptureRow, 'spec_json'> & { estimateGpuMin?: number })[];
  events: { id: number; at: string; kind: string; detail: string | null }[];
}

export function createJob(
  db: Db,
  args: { id?: string; labId: string; captures: CaptureInput[]; reason: string; proposedBy: 'user' | 'assistant'; budgetGpuMin: number },
): string {
  // the browser may choose the id so that a job handle exists before the request returns
  const id = args.id ?? `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  tx(db, () => {
    run(
      db,
      `insert into jobs (id, lab_id, status, proposed_by, reason, hosts, budget_gpu_min, created_at) values (?, ?, 'proposed', ?, ?, ?, ?, ?)`,
      id,
      args.labId,
      args.proposedBy,
      args.reason,
      [...new Set(args.captures.map((c) => c.host))].join(', '),
      args.budgetGpuMin,
      now(),
    );
    for (const c of args.captures) {
      const { experiment, arm, mode } = splitRef(c.ref);
      run(
        db,
        `insert into job_captures (job_id, hash, ref, experiment, arm, mode, host, reps, spec_json) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        c.hash,
        c.ref,
        experiment,
        arm,
        mode,
        c.host,
        c.reps,
        JSON.stringify(c.spec),
      );
    }
    addJobEvent(db, id, 'job.proposed', args.reason);
  });
  return id;
}

export const addJobEvent = (db: Db, jobId: string, kind: string, detail?: string | null) =>
  Number(run(db, 'insert into job_events (job_id, at, kind, detail) values (?, ?, ?, ?)', jobId, now(), kind, detail ?? null).lastInsertRowid);

export function updateJob(db: Db, id: string, patch: Partial<Pick<JobRow, 'status' | 'progress' | 'error' | 'approved_at' | 'finished_at'>>) {
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  if (!keys.length) return;
  run(db, `update jobs set ${keys.map((k) => `${k} = ?`).join(', ')} where id = ?`, ...keys.map((k) => patch[k] ?? null), id);
}

export const setCaptureStatus = (db: Db, jobId: string, hash: string, status: string, error: string | null = null) =>
  run(db, 'update job_captures set status = ?, error = ? where job_id = ? and hash = ?', status, error, jobId, hash);

export const getJobRow = (db: Db, id: string) => get<JobRow>(db, 'select * from jobs where id = ?', id);
export const jobCaptures = (db: Db, id: string) => all<JobCaptureRow>(db, 'select * from job_captures where job_id = ? order by rowid', id);

export function getJob(db: Db, id: string): JobView | undefined {
  const job = getJobRow(db, id);
  if (!job) return undefined;
  return {
    ...job,
    captures: jobCaptures(db, id).map(({ spec_json: _spec, ...c }) => c),
    events: all(db, 'select id, at, kind, detail from job_events where job_id = ? order by id', id),
  };
}

export const listJobs = (db: Db, labId?: string) =>
  (labId ? all<JobRow>(db, 'select * from jobs where lab_id = ? order by created_at', labId) : all<JobRow>(db, 'select * from jobs order by created_at'))
    .map((j) => getJob(db, j.id)!)
    .filter(Boolean);

/** Jobs a previous server process left mid-flight cannot be resumed: their child processes are gone. */
export function failInterruptedJobs(db: Db): number {
  const stale = all<{ id: string }>(db, `select id from jobs where status in ('approved', 'running', 'importing')`);
  for (const j of stale) {
    updateJob(db, j.id, { status: 'failed', error: 'server restarted before the job finished', finished_at: now() });
    addJobEvent(db, j.id, 'job.failed', 'server restarted before the job finished');
  }
  return stale.length;
}

// ── annotations ───────────────────────────────────────────────────────────────────────────

export const listAnnotations = (db: Db, labId: string) =>
  all<{ id: number; lab_id: string; target: string; kind: string; body_json: string; author: string; created_at: string }>(
    db,
    'select * from annotations where lab_id = ? order by id',
    labId,
  ).map(({ body_json, ...a }) => ({ ...a, body: JSON.parse(body_json) }));

export const addAnnotation = (db: Db, a: { labId: string; target: string; kind: string; body: unknown; author: string }) =>
  Number(
    run(db, 'insert into annotations (lab_id, target, kind, body_json, author, created_at) values (?, ?, ?, ?, ?, ?)', a.labId, a.target, a.kind, JSON.stringify(a.body), a.author, now())
      .lastInsertRowid,
  );
