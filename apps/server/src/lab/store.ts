// Lab programs, artifacts, runs and bundles, jobs (read-only) and annotations: Perf Lab's store
// (PL/server/store.ts) on the lab_* tables, returning the same shapes Perf Lab's routes return.
import { gunzipSync, gzipSync } from 'node:zlib';
import { all, get, now, run, tx, type Db } from '../db.ts';
import { splitRef, type CaptureInput } from './captures.ts';

type Json = Record<string, unknown>;

export type Origin = 'synthetic' | 'measured';
export type ArtifactStatus = 'running' | 'available' | 'failed';
export type LabJobStatus = 'proposed' | 'approved' | 'running' | 'importing' | 'done' | 'failed' | 'cancelled';

/** One repetition of a capture: the run entity, its entities and its links (PL/server/importer.ts Bundle). */
export interface Bundle {
  run: Json;
  entities: Json[];
  links: Json[];
}

/** Entities and links are stored as gzip-compressed JSON; value records keep their `__value` marker. */
export const pack = (x: unknown): Uint8Array => gzipSync(Buffer.from(JSON.stringify(x), 'utf8'));
export const unpack = <T>(b: Uint8Array): T => JSON.parse(gunzipSync(b).toString('utf8')) as T;

// ── programs ────────────────────────────────────────────────────────────────────────────────────────────────────

export interface ProgramRow {
  lab_id: string;
  source: string;
  preset_hash: string | null;
  updated_at: string;
}

export const MAX_PROGRAM_CHARS = 500_000;

export const getProgram = (db: Db, labId: string): ProgramRow | undefined => get<ProgramRow>(db, 'select * from lab_programs where lab_id = ?', labId);

export function putProgram(db: Db, labId: string, source: string, presetHash: string | null, updatedAt = now()): void {
  run(
    db,
    `insert into lab_programs (lab_id, source, preset_hash, updated_at) values (?, ?, ?, ?)
     on conflict (lab_id) do update set source = excluded.source, preset_hash = excluded.preset_hash, updated_at = excluded.updated_at`,
    labId, source, presetHash, updatedAt,
  );
}

export const deleteProgram = (db: Db, labId: string): void => void run(db, 'delete from lab_programs where lab_id = ?', labId);

// ── artifacts ───────────────────────────────────────────────────────────────────────────────────────────────────

export interface ArtifactRow {
  hash: string;
  lab_id: string;
  experiment: string;
  arm: string;
  mode: string;
  host: string;
  reps: number;
  origin: Origin;
  status: ArtifactStatus;
  created_at: string;
  imported_at: string | null;
  source: string | null;
}

export interface CatalogEntry {
  origin: Origin;
  /** null for captures a lab job executed, 'evidence:<sha256>' for captures imported from an archive */
  source: string | null;
  /** experiment/arm/mode */
  ref: string;
  host: string;
  reps: number;
  labId: string;
  importedAt: string | null;
}

export const listArtifacts = (db: Db): ArtifactRow[] =>
  all<ArtifactRow>(db, 'select hash, lab_id, experiment, arm, mode, host, reps, origin, status, created_at, imported_at, source from lab_artifacts order by created_at, hash');

/** Every available artifact by capture hash (GET /catalog). */
export function catalog(db: Db): Record<string, CatalogEntry> {
  const out: Record<string, CatalogEntry> = {};
  for (const a of listArtifacts(db)) {
    if (a.status !== 'available') continue;
    out[a.hash] = { origin: a.origin, source: a.source, ref: `${a.experiment}/${a.arm}/${a.mode}`, host: a.host, reps: a.reps, labId: a.lab_id, importedAt: a.imported_at };
  }
  return out;
}

/** A new artifact; on a known hash, only status, origin, import time and source change (Perf Lab's rule). */
export function insertArtifact(db: Db, labId: string, c: CaptureInput, origin: Origin, status: ArtifactStatus = 'available', source: string | null = null): number {
  const { experiment, arm, mode } = splitRef(c.ref);
  const at = now();
  return Number(
    run(
      db,
      `insert into lab_artifacts (hash, lab_id, experiment, arm, mode, host, reps, spec_json, origin, status, created_at, imported_at, source)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict (hash) do update set status = excluded.status, origin = excluded.origin, imported_at = excluded.imported_at, source = excluded.source`,
      c.hash, labId, experiment, arm, mode, c.host, c.reps, JSON.stringify(c.spec), origin, status, at, status === 'available' ? at : null, source,
    ).changes,
  );
}

/**
 * Records default-parameter synthetic captures. Hosts that execute lab work are never seeded (in Perf Lab: `local`),
 * evidence-backed captures exist only once their archive is imported, and a known hash is left as it is.
 */
export function seedSynthetic(db: Db, labId: string, captures: CaptureInput[], executable: (host: string) => boolean): number {
  let n = 0;
  tx(db, () => {
    for (const c of captures) {
      if (executable(c.host)) continue;
      if (c.spec.evidence) continue;
      if (get(db, 'select 1 from lab_artifacts where hash = ?', c.hash)) continue;
      n += insertArtifact(db, labId, c, 'synthetic');
    }
  });
  return n;
}

// ── runs and bundles ────────────────────────────────────────────────────────────────────────────────────────────

/** The bundles of one capture, repetitions in order (GET /bundles). */
export function bundlesFor(db: Db, hash: string): Bundle[] {
  return all<{ run_json: string; entities: Uint8Array; links: Uint8Array }>(
    db,
    'select r.run_json, b.entities, b.links from lab_runs r join lab_run_bundles b on b.hash = r.hash and b.rep = r.rep where r.hash = ? order by r.rep',
    hash,
  ).map((r) => ({ run: JSON.parse(r.run_json) as Json, entities: unpack<Json[]>(r.entities), links: unpack<Json[]>(r.links) }));
}

export const MAX_BUNDLE_HASHES = 64;

// ── jobs (read-only: lab jobs do not execute on the Kiln server yet) ────────────────────────────────────────────────

export interface LabJobRow {
  id: string;
  lab_id: string;
  status: LabJobStatus;
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

export interface LabJobCaptureRow {
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

/** Perf Lab's JobView (PL/server/store.ts): the row, its captures without their specs, and its events. */
export interface LabJobView extends LabJobRow {
  captures: Omit<LabJobCaptureRow, 'spec_json'>[];
  events: { id: number; at: string; kind: string; detail: string | null }[];
}

export function getJob(db: Db, id: string): LabJobView | undefined {
  const job = get<LabJobRow>(db, 'select * from lab_jobs where id = ?', id);
  if (!job) return undefined;
  return {
    ...job,
    captures: all<LabJobCaptureRow>(db, 'select * from lab_job_captures where job_id = ? order by rowid', id).map(({ spec_json: _spec, ...c }) => c),
    events: all(db, 'select id, at, kind, detail from lab_job_events where job_id = ? order by id', id),
  };
}

export const listJobs = (db: Db, labId?: string): LabJobView[] =>
  (labId ? all<{ id: string }>(db, 'select id from lab_jobs where lab_id = ? order by created_at, id', labId) : all<{ id: string }>(db, 'select id from lab_jobs order by created_at, id'))
    .map((j) => getJob(db, j.id))
    .filter((j): j is LabJobView => j !== undefined);

// ── annotations ─────────────────────────────────────────────────────────────────────────────────────────────────

export interface Annotation {
  id: number;
  lab_id: string;
  target: string;
  kind: string;
  body: unknown;
  author: 'user' | 'assistant';
  created_at: string;
}

export const listAnnotations = (db: Db, labId: string): Annotation[] =>
  all<Omit<Annotation, 'body'> & { body_json: string }>(db, 'select * from lab_annotations where lab_id = ? order by id', labId).map(({ body_json, ...a }) => ({
    ...a,
    body: JSON.parse(body_json) as unknown,
  }));

export const addAnnotation = (db: Db, a: { labId: string; target: string; kind: string; body: unknown; author: 'user' | 'assistant'; createdAt?: string }): number =>
  Number(
    run(db, 'insert into lab_annotations (lab_id, target, kind, body_json, author, created_at) values (?, ?, ?, ?, ?, ?)', a.labId, a.target, a.kind, JSON.stringify(a.body ?? null), a.author, a.createdAt ?? now())
      .lastInsertRowid,
  );
