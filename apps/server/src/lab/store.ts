// Lab programs, the catalog of captures with their runs and bundles, and annotations: Perf Lab's store
// (PL/server/store.ts), returning the shapes Perf Lab's routes return. Captures, runs and run_bundles are shared with
// the execution core (exec/import.ts): a lab program finds a capture by its lab hash, every other client by its id.
import { gunzipSync, gzipSync } from 'node:zlib';
import { all, get, now, run, type Db } from '../db.ts';

type Json = Record<string, unknown>;


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

// ── catalog ─────────────────────────────────────────────────────────────────────────────────────────────────────

export interface CatalogEntry {
  /** measured: imported from Perf Lab or an archive; job: executed by a Kiln job */
  origin: 'measured' | 'job';
  /** 'evidence:<sha256>' or 'job:<id>' */
  source: string | null;
  /** experiment/arm/mode */
  ref: string;
  host: string;
  reps: number;
  labId: string | null;
  importedAt: string | null;
  /** The capture's identity (kiln-capture/1) where it differs from the key */
  capture?: string;
  kind?: string | null;
}

interface CaptureRow {
  hash: string;
  kind: string | null;
  lab_id: string | null;
  lab_hash: string | null;
  experiment: string;
  arm: string;
  mode: string;
  host: string;
  reps: number;
  origin: 'executed' | 'imported';
  source: string | null;
  imported_at: string | null;
}

/** Every available capture, keyed by its lab hash where it has one (GET /catalog); the latest import wins a lab hash. */
export function catalog(db: Db): Record<string, CatalogEntry> {
  const out: Record<string, CatalogEntry> = {};
  for (const a of all<CaptureRow>(db, `select hash, kind, lab_id, lab_hash, experiment, arm, mode, host, reps, origin, source, imported_at from captures where status = 'available' order by imported_at, hash`)) {
    const key = a.lab_hash ?? a.hash;
    out[key] = {
      origin: a.origin === 'executed' ? 'job' : 'measured', source: a.source, ref: `${a.experiment}/${a.arm}/${a.mode}`, host: a.host, reps: a.reps, labId: a.lab_id, importedAt: a.imported_at,
      ...(key !== a.hash ? { capture: a.hash } : {}), kind: a.kind,
    };
  }
  return out;
}

// ── runs and bundles ────────────────────────────────────────────────────────────────────────────────────────────

/** The capture a key names: its id, or the latest capture with that lab hash. */
const resolve = (db: Db, key: string): string | undefined =>
  get<{ hash: string }>(db, `select hash from captures where hash = ? union all select * from (select hash from captures where lab_hash = ? and status = 'available' order by imported_at desc limit 1) limit 1`, key, key)?.hash;

/** The bundles of one capture, repetitions in order (GET /bundles). */
export function bundlesFor(db: Db, key: string): Bundle[] {
  const hash = resolve(db, key);
  if (!hash) return [];
  return all<{ run_json: string; entities: Uint8Array; links: Uint8Array }>(
    db,
    'select r.run_json, b.entities, b.links from runs r join run_bundles b on b.hash = r.hash and b.rep = r.rep where r.hash = ? order by r.rep',
    hash,
  ).map((r) => ({ run: JSON.parse(r.run_json) as Json, entities: unpack<Json[]>(r.entities), links: unpack<Json[]>(r.links) }));
}

export const MAX_BUNDLE_HASHES = 64;

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
