// The Perf Lab importer: copies a Perf Lab data directory (PL/.data) into the Kiln server's database and
// KILN_DATA_DIR/lab/. A copy of the source database is opened read-only, and no file under the source directory is written.
//
// Everything is copied as Perf Lab recorded it (ids, times, statuses), and every identity Perf Lab recorded is checked
// before anything is stored: an archive's and a media file's bytes must hash to their SHA-256 (and have the recorded
// size), an artifact's spec must hash to its capture hash, a bundle must unpack to its recorded counts, a dataset must
// hold the image and annotation rows it counts. What fails a check is refused, reported, and not stored.
//
// Re-running adds nothing new: every row is keyed as Perf Lab keys it, and a known key is counted `present`.
// Not imported: synthetic artifacts (stand-ins generated from a hash, not measurements), Perf Lab's job history (its
// jobs ran on a runner that no longer exists; the one job API of KILN-003 replaces them, and what they measured is
// kept as captures and runs), Perf Lab's assistant transcripts (conversations, messages, llm_calls) — agent
// conversations are not lab data, and Kiln keeps its own (llm_calls, guide §31) — and the raw job output directories
// (PL/.data/artifacts), whose imported form is the runs and bundles. A measured artifact becomes an `imported` capture
// whose lab_hash is its Perf Lab hash.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { get, now, run, tx, type Db } from '../db.ts';
import { labCaptureHash } from '@kiln/exec';
import { getArchive, registerArchive, type ArchiveFile } from './evidence.ts';
import { mediaDir, mediaFile, mimeOf, SHA256_HEX, sha256, writeFileAtomic, type Mime } from './files.ts';
import { unpack } from './store.ts';

/** Perf Lab's schema version the importer reads (PL/server/db.ts migration 5: evidence, datasets, media) */
export const PL_SCHEMA = 5;
export const PL_DB = 'perf-lab.sqlite';

export interface KindSummary {
  added: number;
  present: number;
  refused: { key: string; reason: string }[];
}

export interface ImportSummary {
  source: string;
  sourceSchema: number;
  datasets: KindSummary;
  archives: KindSummary;
  media: KindSummary;
  artifacts: KindSummary;
  runs: KindSummary;
  programs: KindSummary;
  annotations: KindSummary;
  /** bytes written after verification */
  bytes: { archives: number; media: number };
  /** rows deliberately left behind, by Perf Lab table */
  notImported: Record<string, number>;
  notes: string[];
}

const KINDS = ['datasets', 'archives', 'media', 'artifacts', 'runs', 'programs', 'annotations'] as const;
type Kind = (typeof KINDS)[number];

const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));
/** Whether dir is root or below it, symbolic links resolved (the kiln checkout is often reached through one). */
const real = (p: string): string => {
  const abs = resolve(p);
  if (existsSync(abs)) return realpathSync(abs);
  const parent = dirname(abs);
  return parent === abs ? abs : join(real(parent), basename(abs));
};
const inside = (dir: string, root: string): boolean => {
  const r = relative(real(root), real(dir));
  return r === '' || (!r.startsWith('..') && !isAbsolute(r));
};

export const refusedCount = (s: ImportSummary): number => KINDS.reduce((n, k) => n + s[k].refused.length, 0);

/** Imports a Perf Lab data directory; throws only when the source cannot be read at all. */
export function importPerfLab({ source, db, dataDir }: { source: string; db: Db; dataDir: string }): ImportSummary {
  const src = resolve(source);
  const file = join(src, PL_DB);
  if (!existsSync(file)) throw new Error(`no Perf Lab database at ${file}`);
  if (inside(resolve(dataDir), src)) throw new Error(`the Kiln data directory ${resolve(dataDir)} is inside the Perf Lab data directory ${src}; the import never writes there`);
  // SQLite rewrites a WAL database's -shm index even on a read-only open, so the database and its WAL are copied to a
  // temporary directory and the copy is opened: no byte or timestamp under the source directory changes
  const copy = mkdtempSync(join(tmpdir(), 'kiln-lab-import-'));
  let pl: DatabaseSync | null = null;
  try {
    copyFileSync(file, join(copy, PL_DB));
    if (existsSync(`${file}-wal`)) copyFileSync(`${file}-wal`, join(copy, `${PL_DB}-wal`));
    pl = new DatabaseSync(join(copy, PL_DB), { readOnly: true });
    return importFrom(pl, src, db, dataDir);
  } finally {
    pl?.close();
    rmSync(copy, { recursive: true, force: true });
  }
}

function importFrom(pl: DatabaseSync, src: string, db: Db, dataDir: string): ImportSummary {
  const q = <T>(sql: string): T[] => pl.prepare(sql).all() as T[];
  const tables = new Set(q<{ name: string }>("select name from sqlite_master where type = 'table'").map((t) => t.name));
  const sourceSchema = tables.has('schema_migrations') ? (q<{ v: number | null }>('select max(version) as v from schema_migrations')[0]?.v ?? 0) : 0;
  if (sourceSchema < PL_SCHEMA) throw new Error(`the Perf Lab database is at schema ${sourceSchema}; the importer reads schema ${PL_SCHEMA} (start Perf Lab's server once to migrate it)`);

  const kind = (): KindSummary => ({ added: 0, present: 0, refused: [] });
  const s: ImportSummary = {
    source: src, sourceSchema,
    datasets: kind(), archives: kind(), media: kind(), artifacts: kind(), runs: kind(), programs: kind(), annotations: kind(),
    bytes: { archives: 0, media: 0 },
    notImported: {},
    notes: [],
  };
  if (sourceSchema > PL_SCHEMA) s.notes.push(`the Perf Lab database is at schema ${sourceSchema}; columns added after schema ${PL_SCHEMA} are not imported`);
  const refuse = (k: Kind, key: string, reason: string) => void s[k].refused.push({ key, reason });

  // ── datasets: copied row for row, before the archives, so the archive's own registration finds them present ────────
  for (const d of q<Record<string, string | number>>('select * from datasets order by added_at, id')) {
    const id = String(d.id);
    if (get(db, 'select 1 from lab_datasets where id = ?', id)) {
      s.datasets.present++;
      continue;
    }
    const images = pl.prepare('select * from dataset_images where dataset_id = ? order by image_id').all(id) as Record<string, string | number | null>[];
    const anns = pl.prepare('select * from dataset_annotations where dataset_id = ? order by id').all(id) as Record<string, string | number>[];
    if (!SHA256_HEX.test(id)) refuse('datasets', id, 'the id is not a SHA-256');
    else if (images.length !== Number(d.image_count)) refuse('datasets', id, `${images.length} image rows, but the dataset counts ${d.image_count}`);
    else if (anns.length !== Number(d.annotation_count)) refuse('datasets', id, `${anns.length} annotation rows, but the dataset counts ${d.annotation_count}`);
    else {
      try {
        tx(db, () => {
          run(db, 'insert into lab_datasets (id, name, format, privacy, source, provenance_json, categories_json, image_count, annotation_count, added_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            id, d.name!, d.format!, d.privacy!, d.source!, d.provenance_json!, d.categories_json!, d.image_count!, d.annotation_count!, d.added_at!);
          const im = db.prepare('insert into lab_dataset_images (dataset_id, image_id, file_name, sha256, width, height, license_name, license_url, source_url, page_url, strata_json) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
          for (const i of images) im.run(id, i.image_id!, i.file_name!, i.sha256!, i.width!, i.height!, i.license_name ?? null, i.license_url ?? null, i.source_url!, i.page_url ?? null, i.strata_json!);
          const an = db.prepare('insert into lab_dataset_annotations (dataset_id, id, image_id, category, bbox_json, area, iscrowd) values (?, ?, ?, ?, ?, ?, ?)');
          for (const a of anns) an.run(id, a.id!, a.image_id!, a.category!, a.bbox_json!, a.area!, a.iscrowd!);
        });
        s.datasets.added++;
      } catch (e) {
        refuse('datasets', id, why(e));
      }
    }
  }

  // ── evidence archives: verified, then registered from their bytes exactly as an upload is ───────────────────────────
  for (const a of q<{ sha256: string; name: string; bytes: number; files_json: string; added_at: string }>('select * from evidence_archives order by added_at, sha256')) {
    if (!SHA256_HEX.test(a.sha256)) {
      refuse('archives', a.sha256, 'the key is not a SHA-256');
      continue;
    }
    if (getArchive(db, a.sha256)) {
      s.archives.present++;
      continue;
    }
    const path = join(src, 'evidence', `${a.sha256}.tar.gz`);
    if (!existsSync(path)) {
      refuse('archives', a.sha256, `no file ${path}`);
      continue;
    }
    const bytes = readFileSync(path);
    const actual = sha256(bytes);
    if (bytes.byteLength !== a.bytes) refuse('archives', a.sha256, `the file has ${bytes.byteLength} bytes, Perf Lab recorded ${a.bytes}`);
    else if (actual !== a.sha256) refuse('archives', a.sha256, `checksum mismatch: the file hashes to ${actual}`);
    else {
      try {
        const { archive } = registerArchive(db, dataDir, bytes, a.name, { addedAt: a.added_at });
        const recorded = JSON.stringify((JSON.parse(a.files_json) as ArchiveFile[]).map((f) => [f.path, f.bytes]));
        if (JSON.stringify(archive.files.map((f) => [f.path, f.bytes])) !== recorded)
          s.notes.push(`archive ${a.sha256.slice(0, 12)}: its entries differ from the file list Perf Lab recorded; the list from the verified bytes is kept`);
        s.archives.added++;
        s.bytes.archives += bytes.byteLength;
      } catch (e) {
        refuse('archives', a.sha256, why(e));
      }
    }
  }

  // ── media: each file verified against its name, its recorded size and its recorded type ─────────────────────────────
  mkdirSync(mediaDir(dataDir), { recursive: true });
  for (const m of q<{ sha256: string; bytes: number; mime: string; privacy: string; source_url: string | null; added_at: string }>('select * from media order by sha256')) {
    if (!SHA256_HEX.test(m.sha256)) {
      refuse('media', m.sha256, 'the key is not a SHA-256');
      continue;
    }
    if (m.mime !== 'image/jpeg' && m.mime !== 'image/png') {
      refuse('media', m.sha256, `type ${m.mime} is neither image/jpeg nor image/png`);
      continue;
    }
    const mime: Mime = m.mime;
    const dest = mediaFile(dataDir, m.sha256, mime);
    const known = get(db, 'select 1 from lab_media where sha256 = ?', m.sha256);
    if (known && existsSync(dest) && sha256(readFileSync(dest)) === m.sha256) {
      s.media.present++;
      continue;
    }
    const path = join(src, 'media', `${m.sha256}.${mime === 'image/png' ? 'png' : 'jpg'}`);
    if (!existsSync(path)) {
      refuse('media', m.sha256, `no file ${path}`);
      continue;
    }
    const bytes = readFileSync(path);
    const actual = sha256(bytes);
    if (bytes.byteLength !== m.bytes) refuse('media', m.sha256, `the file has ${bytes.byteLength} bytes, Perf Lab recorded ${m.bytes}`);
    else if (actual !== m.sha256) refuse('media', m.sha256, `checksum mismatch: the file hashes to ${actual}`);
    else if (mimeOf(bytes) !== mime) refuse('media', m.sha256, `the bytes are not ${mime}`);
    else {
      try {
        writeFileAtomic(dest, bytes);
        run(db, 'insert into lab_media (sha256, bytes, mime, privacy, source_url, added_at) values (?, ?, ?, ?, ?, ?) on conflict (sha256) do nothing', m.sha256, m.bytes, mime, m.privacy, m.source_url, m.added_at);
        s.media.added++;
        s.bytes.media += bytes.byteLength;
      } catch (e) {
        refuse('media', m.sha256, why(e));
      }
    }
  }

  // ── artifacts: the capture hash recomputed from the spec; measured ones only ─────────────────────────────────────
  type ArtifactRow = { hash: string; lab_id: string; experiment: string; arm: string; mode: string; host: string; reps: number; spec_json: string; origin: string; status: string; created_at: string; imported_at: string | null; source: string | null };
  const imported = new Set<string>(), synthetic = new Set<string>();
  for (const a of q<ArtifactRow>('select * from artifacts order by created_at, hash')) {
    if (a.origin !== 'measured') {
      synthetic.add(a.hash);
      s.notImported.synthetic_artifacts = (s.notImported.synthetic_artifacts ?? 0) + 1;
      continue;
    }
    let actual: string;
    try {
      actual = labCaptureHash(JSON.parse(a.spec_json));
    } catch (e) {
      refuse('artifacts', a.hash, `spec is not JSON: ${why(e)}`);
      continue;
    }
    if (actual !== a.hash) {
      refuse('artifacts', a.hash, `the spec hashes to ${actual}`);
      continue;
    }
    try {
      if (!get(db, 'select 1 from captures where hash = ?', a.hash)) {
        run(db, `insert into captures (hash, kind, lab_id, lab_hash, experiment, arm, mode, host, reps, spec_json, origin, status, created_at, imported_at, source) values (?, null, ?, ?, ?, ?, ?, ?, ?, ?, 'imported', ?, ?, ?, ?)`,
          a.hash, a.lab_id, a.hash, a.experiment, a.arm, a.mode, a.host, a.reps, a.spec_json, a.status, a.created_at, a.imported_at, a.source);
        s.artifacts.added++;
      } else s.artifacts.present++;
      imported.add(a.hash);
    } catch (e) {
      refuse('artifacts', a.hash, why(e));
    }
  }

  // ── runs and their bundles: one repetition each, stored only with a bundle that unpacks to its recorded counts ──────
  type RunRow = { hash: string; rep: number; ref: string; experiment: string; arm: string; mode: string; host: string; started_at: string | null; duration_s: number | null; run_json: string };
  type BundleCols = { entities: Uint8Array | null; links: Uint8Array | null; n_entities: number | null; n_links: number | null };
  for (const r of q<RunRow & BundleCols>('select r.*, b.entities, b.links, b.n_entities, b.n_links from runs r left join run_bundles b on b.hash = r.hash and b.rep = r.rep order by r.hash, r.rep')) {
    const key = `${r.hash}#${r.rep}`;
    if (get(db, 'select 1 from runs where hash = ? and rep = ?', r.hash, r.rep)) {
      s.runs.present++;
      continue;
    }
    if (synthetic.has(r.hash)) {
      s.notImported.synthetic_runs = (s.notImported.synthetic_runs ?? 0) + 1;
      continue;
    }
    if (!imported.has(r.hash)) {
      refuse('runs', key, 'its artifact was not imported');
      continue;
    }
    if (!r.entities || !r.links) {
      refuse('runs', key, 'the run has no bundle');
      continue;
    }
    try {
      JSON.parse(r.run_json);
      const entities = unpack<unknown>(r.entities);
      const links = unpack<unknown>(r.links);
      if (!Array.isArray(entities) || entities.length !== r.n_entities) throw new Error(`the bundle holds ${Array.isArray(entities) ? entities.length : 'no array of'} entities, Perf Lab recorded ${r.n_entities}`);
      if (!Array.isArray(links) || links.length !== r.n_links) throw new Error(`the bundle holds ${Array.isArray(links) ? links.length : 'no array of'} links, Perf Lab recorded ${r.n_links}`);
      tx(db, () => {
        run(db, 'insert into runs (hash, rep, ref, experiment, arm, mode, host, started_at, duration_s, run_json) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          r.hash, r.rep, r.ref, r.experiment, r.arm, r.mode, r.host, r.started_at, r.duration_s, r.run_json);
        run(db, 'insert into run_bundles (hash, rep, entities, links, n_entities, n_links) values (?, ?, ?, ?, ?, ?)', r.hash, r.rep, r.entities!, r.links!, r.n_entities!, r.n_links!);
      });
      s.runs.added++;
    } catch (e) {
      refuse('runs', key, why(e));
    }
  }

  // ── jobs: Perf Lab's job history is not carried over (its runs are) ───────────────────────────────────────────────
  if (tables.has('jobs')) s.notImported.jobs = q<{ n: number }>('select count(*) as n from jobs')[0]?.n ?? 0;

  // ── programs: an edit already made here is never overwritten ───────────────────────────────────────────────────────
  for (const p of q<{ lab_id: string; source: string; preset_hash: string | null; updated_at: string }>('select * from programs order by lab_id')) {
    if (get(db, 'select 1 from lab_programs where lab_id = ?', p.lab_id)) {
      s.programs.present++;
      continue;
    }
    run(db, 'insert into lab_programs (lab_id, source, preset_hash, updated_at) values (?, ?, ?, ?)', p.lab_id, p.source, p.preset_hash, p.updated_at);
    s.programs.added++;
  }

  // ── annotations: no natural key in Perf Lab, so a row identical in every column counts as present ──────────────────
  for (const a of q<{ id: number; lab_id: string; target: string; kind: string; body_json: string; author: string; created_at: string }>('select * from annotations order by id')) {
    if (get(db, 'select 1 from lab_annotations where lab_id = ? and target = ? and kind = ? and body_json = ? and author = ? and created_at = ?', a.lab_id, a.target, a.kind, a.body_json, a.author, a.created_at)) {
      s.annotations.present++;
      continue;
    }
    try {
      run(db, 'insert into lab_annotations (lab_id, target, kind, body_json, author, created_at) values (?, ?, ?, ?, ?, ?)', a.lab_id, a.target, a.kind, a.body_json, a.author, a.created_at);
      s.annotations.added++;
    } catch (e) {
      refuse('annotations', String(a.id), why(e));
    }
  }

  for (const t of ['conversations', 'messages', 'llm_calls'])
    if (tables.has(t)) s.notImported[t] = q<{ n: number }>(`select count(*) as n from ${t}`)[0]?.n ?? 0;
  return s;
}

const n = (x: number): string => x.toLocaleString('en-US');

/** The summary as the command line prints it. */
export function formatSummary(s: ImportSummary, target: { dbFile: string; dataDir: string }): string {
  const lines = [`Perf Lab import: ${join(s.source, PL_DB)} (schema ${s.sourceSchema}, read-only)`, `            into ${target.dbFile} and ${join(target.dataDir, 'lab')}`, ''];
  lines.push(`  ${'kind'.padEnd(12)} ${'added'.padStart(7)} ${'present'.padStart(8)} ${'refused'.padStart(8)}`);
  for (const k of KINDS) lines.push(`  ${k.padEnd(12)} ${n(s[k].added).padStart(7)} ${n(s[k].present).padStart(8)} ${n(s[k].refused.length).padStart(8)}`);
  lines.push('', `  verified bytes written: archives ${n(s.bytes.archives)}, media ${n(s.bytes.media)}`);
  const left = Object.entries(s.notImported).filter(([, c]) => c > 0);
  if (left.length) lines.push(`  not imported (synthetic stand-ins, Perf Lab job history, assistant transcripts): ${left.map(([t, c]) => `${t} ${n(c)}`).join(', ')}`);
  for (const k of KINDS) for (const r of s[k].refused) lines.push(`  REFUSED ${k} ${r.key}: ${r.reason}`);
  for (const note of s.notes) lines.push(`  note: ${note}`);
  return `${lines.join('\n')}\n`;
}
