// Fixtures for the lab route group and the importer: a tar writer (including hostile entries), a two-image COCO
// evidence archive, rows written straight into the lab tables, and a synthetic Perf Lab data directory at Perf Lab's
// schema 5. Nothing here reads lab-workbench/.data (guide §36).
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { gzipSync } from 'node:zlib';
import type { Db } from '../../src/db.ts';
import { captureHash } from '../../src/lab/captures.ts';
import { mediaDir, mediaFile, sha256 } from '../../src/lab/files.ts';
import { pack, type Bundle } from '../../src/lab/store.ts';

const BLOCK = 512;

/** A ustar archive; `type` '2' (symlink) and paths like '../x' or '/etc/x' build hostile fixtures. */
export function writeTar(entries: { path: string; data?: Uint8Array | string; type?: string }[]): Uint8Array {
  const blocks: Uint8Array[] = [];
  for (const e of entries) {
    const data = typeof e.data === 'string' ? new TextEncoder().encode(e.data) : (e.data ?? new Uint8Array());
    const h = new Uint8Array(BLOCK);
    const put = (s: string, start: number, len: number) => h.set(new TextEncoder().encode(s).subarray(0, len), start);
    put(e.path, 0, 100);
    put('0000644\0', 100, 8);
    put('0000000\0', 108, 8);
    put('0000000\0', 116, 8);
    put(`${data.length.toString(8).padStart(11, '0')}\0`, 124, 12);
    put('00000000000\0', 136, 12);
    put('        ', 148, 8);
    h[156] = (e.type ?? '0').charCodeAt(0);
    if (e.type === '2') put('target', 157, 100);
    put('ustar\0', 257, 6);
    put('00', 263, 2);
    let sum = 0;
    for (const x of h) sum += x;
    put(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8);
    blocks.push(h, data, new Uint8Array((BLOCK - (data.length % BLOCK)) % BLOCK));
  }
  blocks.push(new Uint8Array(BLOCK * 2));
  return Buffer.concat(blocks);
}

export const tarGz = (entries: Parameters<typeof writeTar>[0]): Uint8Array => gzipSync(writeTar(entries));

export const JPEG = (tag: string): Uint8Array => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new TextEncoder().encode(tag), 0xff, 0xd9]);
export const IMAGES = { 1993: JPEG('chair'), 7088: JPEG('dog') };

/** A two-image COCO selection with the provenance shape of the PR 1005 DGX archive. */
export function cocoManifest(opts: { host?: string } = {}) {
  const manifest = JSON.stringify({
    licenses: [{ id: 4, name: 'Attribution License', url: 'http://creativecommons.org/licenses/by/2.0/' }],
    categories: [{ id: 1, name: 'person' }, { id: 62, name: 'chair' }],
    images: [
      { id: 1993, file_name: '000000001993.jpg', width: 640, height: 419, license: 4, coco_url: `http://${opts.host ?? 'images.cocodataset.org'}/val2017/000000001993.jpg`, flickr_url: 'http://example/1993' },
      { id: 7088, file_name: '000000007088.jpg', width: 500, height: 375, license: 4, coco_url: `http://${opts.host ?? 'images.cocodataset.org'}/val2017/000000007088.jpg` },
    ],
    annotations: [
      { id: 1, image_id: 1993, category_id: 62, bbox: [111, 247.7, 118.5, 170.6], area: 20000, iscrowd: 0 },
      { id: 2, image_id: 7088, category_id: 1, bbox: [10, 10, 50, 100], area: 5000, iscrowd: 1 },
    ],
  });
  const provenance = {
    seed: 20261009,
    selected_manifest_sha256: sha256(manifest),
    strata: [{ category: 'chair', size: 'large', image_ids: [1993] }],
    negative_ids: [7088],
    image_hashes: [
      { id: 1993, file_name: '000000001993.jpg', sha256: sha256(IMAGES[1993]) },
      { id: 7088, file_name: '000000007088.jpg', sha256: sha256(IMAGES[7088]) },
    ],
  };
  return { manifest, provenance, datasetId: sha256(manifest) };
}

export function cocoArchive(opts: { badHash?: boolean; host?: string; extra?: string } = {}): Uint8Array {
  const { manifest, provenance } = cocoManifest(opts);
  return tarGz([
    { path: 'qualification/coco/', type: '5' },
    { path: 'qualification/coco/instances_selected.json', data: manifest },
    { path: 'qualification/coco/fixture-provenance.json', data: JSON.stringify(opts.badHash ? { ...provenance, selected_manifest_sha256: '0'.repeat(64) } : provenance) },
    { path: 'qualification/reports/paired.json', data: opts.extra ?? '{"results":[]}' },
  ]);
}

// ── captures and bundles ────────────────────────────────────────────────────────────────────────────────────────────

export function spec(arm: string, o: { host?: string; evidence?: string; queries?: number } = {}): Record<string, unknown> {
  return {
    schema_version: 1,
    experiment_id: 'sampler-test',
    arm,
    host: o.host ?? 'local',
    workload: { adapter: 'sampler', queries: o.queries ?? 64 },
    collection: { mode: 'timing', requests: 2 },
    ...(o.evidence ? { evidence: { archive: o.evidence } } : {}),
  };
}

export const capture = (arm: string, o: { host?: string; evidence?: string; queries?: number; reps?: number } = {}) => {
  const s = spec(arm, o);
  return { hash: captureHash(s), ref: `sampler-test/${arm}/timing`, host: o.host ?? 'local', reps: o.reps ?? 2, spec: s };
};

/** One repetition's bundle, with a value record that must survive storage with its `__value` marker. */
export function bundle(hash: string, ref: string, rep: number, latency: number): Bundle {
  const run = `${ref}#${rep}`;
  return {
    run: { kind: 'run', id: run, ref: run, run, rep, specHash: hash, measured: true, validity: { ok: true, reasons: [] } },
    entities: [
      { kind: 'request', id: `r${rep}-000`, ref: `${run}!request:r${rep}-000`, run, latency },
      { kind: 'instant', id: 'rusage', ref: `${run}!instant:rusage`, run, userTime: { __value: true, v: 1.5, unit: 'ms', source: `${run}/cpu.json` } },
    ],
    links: [{ from: `${run}!request:r${rep}-000`, to: `${run}!instant:rusage`, rel: 'contains', evidence: 'direct', method: 'test' }],
  };
}

/** A measured artifact with its runs, written straight into the Kiln lab tables. */
export function insertMeasured(db: Db, labId: string, c: ReturnType<typeof capture>, latencies: number[]): void {
  const [experiment, arm, mode] = c.ref.split('/');
  db.prepare(
    `insert into lab_artifacts (hash, lab_id, experiment, arm, mode, host, reps, spec_json, origin, status, created_at, imported_at, source)
     values (?, ?, ?, ?, ?, ?, ?, ?, 'measured', 'available', '2026-10-12T00:00:00.000Z', '2026-10-12T00:01:00.000Z', null)`,
  ).run(c.hash, labId, experiment!, arm!, mode!, c.host, c.reps, JSON.stringify(c.spec));
  latencies.forEach((latency, rep) => {
    const b = bundle(c.hash, c.ref, rep, latency);
    db.prepare('insert into lab_runs (hash, rep, ref, experiment, arm, mode, host, started_at, duration_s, run_json) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      c.hash, rep, c.ref, experiment!, arm!, mode!, c.host, null, 0.5, JSON.stringify(b.run),
    );
    db.prepare('insert into lab_run_bundles (hash, rep, entities, links, n_entities, n_links) values (?, ?, ?, ?, ?, ?)').run(c.hash, rep, pack(b.entities), pack(b.links), b.entities.length, b.links.length);
  });
}

/** A public JPEG in the media store: the file and its row. */
export function insertMedia(db: Db, dataDir: string, bytes: Uint8Array): string {
  const hash = sha256(bytes);
  mkdirSync(mediaDir(dataDir), { recursive: true });
  writeFileSync(mediaFile(dataDir, hash, 'image/jpeg'), bytes);
  db.prepare(`insert into lab_media (sha256, bytes, mime, privacy, source_url, added_at) values (?, ?, 'image/jpeg', 'public', null, '2026-10-12T00:00:00.000Z')`).run(hash, bytes.byteLength);
  return hash;
}

// ── a Perf Lab data directory (PL/.data) at schema 5 ────────────────────────────────────────────────────────────────

/** Perf Lab's tables after its migration 5 (PL/server/db.ts), as the importer reads them. */
const PL_SCHEMA_5 = `
  create table schema_migrations (version integer primary key, applied_at text not null);
  create table programs (lab_id text primary key, source text not null, preset_hash text, updated_at text not null);
  create table artifacts (hash text primary key, lab_id text not null, experiment text not null, arm text not null, mode text not null, host text not null,
    reps integer not null, spec_json text not null, origin text not null, status text not null, created_at text not null, imported_at text, source text);
  create table runs (hash text not null, rep integer not null, ref text not null, experiment text not null, arm text not null, mode text not null, host text not null,
    started_at text, duration_s real, run_json text not null, primary key (hash, rep));
  create table run_bundles (hash text not null, rep integer not null, entities blob not null, links blob not null, n_entities integer not null, n_links integer not null,
    primary key (hash, rep));
  create table jobs (id text primary key, lab_id text not null, status text not null, proposed_by text not null, reason text not null, hosts text not null,
    budget_gpu_min real not null, progress real not null default 0, created_at text not null, approved_at text, finished_at text, error text);
  create table job_captures (job_id text not null, hash text not null, ref text not null, experiment text not null, arm text not null, mode text not null,
    host text not null, reps integer not null, spec_json text not null, status text not null default 'pending', error text, primary key (job_id, hash));
  create table job_events (id integer primary key autoincrement, job_id text not null, at text not null, kind text not null, detail text);
  create table annotations (id integer primary key autoincrement, lab_id text not null, target text not null, kind text not null, body_json text not null,
    author text not null, created_at text not null);
  create table conversations (id text primary key, lab_id text not null, board_id text not null, created_at text not null, updated_at text not null, archived_at text);
  create table messages (id text primary key, conversation_id text not null, seq integer not null, role text not null, mode text not null, content text not null,
    code text, result_json text, status text, created_at text not null);
  create table llm_calls (id integer primary key autoincrement, conversation_id text not null, message_id text, provider text not null, model text not null,
    thinking text, input_tokens integer, output_tokens integer, reasoning_tokens integer, cache_read_tokens integer, cache_write_tokens integer,
    total_tokens integer, duration_ms integer not null, stop_reason text, error text, created_at text not null, prompt_chars integer, est_prompt_tokens integer);
  create table evidence_archives (sha256 text primary key, name text not null, bytes integer not null, files_json text not null, added_at text not null);
  create table datasets (id text primary key, name text not null, format text not null, privacy text not null, source text not null, provenance_json text not null,
    categories_json text not null, image_count integer not null, annotation_count integer not null, added_at text not null);
  create table dataset_images (dataset_id text not null, image_id integer not null, file_name text not null, sha256 text not null, width integer not null,
    height integer not null, license_name text, license_url text, source_url text not null, page_url text, strata_json text not null, primary key (dataset_id, image_id));
  create table dataset_annotations (dataset_id text not null, id integer not null, image_id integer not null, category text not null, bbox_json text not null,
    area real not null, iscrowd integer not null, primary key (dataset_id, id));
  create table media (sha256 text primary key, bytes integer not null, mime text not null, privacy text not null, source_url text, added_at text not null);
`;

export interface PerfLabDir {
  dir: string;
  db: DatabaseSync;
  local: ReturnType<typeof capture>;
  candidate: ReturnType<typeof capture>;
  synthetic: ReturnType<typeof capture>;
  archive: Uint8Array;
  archiveSha: string;
  datasetId: string;
  media: string[];
}

/**
 * A Perf Lab data directory: two measured local captures (two repetitions each), a synthetic DGX capture, the COCO
 * evidence archive with its dataset rows, both images in the media store, a finished job and one left running, a
 * program, an annotation, and one assistant transcript. The database is left open for tests to tamper with; close it
 * (`db.close()`) before importing.
 */
export function makePerfLabDir(): PerfLabDir {
  const dir = mkdtempSync(join(tmpdir(), 'perf-lab-data-'));
  const db = new DatabaseSync(join(dir, 'perf-lab.sqlite'));
  db.exec(PL_SCHEMA_5);
  for (let v = 1; v <= 5; v++) db.prepare('insert into schema_migrations values (?, ?)').run(v, '2026-10-12T00:00:00.000Z');

  const local = capture('baseline');
  const candidate = capture('candidate');
  const synthetic = capture('baseline', { host: 'playback@dgx' });
  const artifact = db.prepare('insert into artifacts values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const [c, origin, at] of [[local, 'measured', '2026-10-12T01:00:00.000Z'], [candidate, 'measured', '2026-10-12T01:00:01.000Z'], [synthetic, 'synthetic', '2026-10-12T01:00:02.000Z']] as const) {
    const [experiment, arm, mode] = c.ref.split('/');
    artifact.run(c.hash, 'sampler', experiment!, arm!, mode!, c.host, c.reps, JSON.stringify(c.spec), origin, 'available', at, at, null);
  }
  for (const [c, lat] of [[local, [2, 2.5]], [candidate, [1, 1.25]]] as const)
    lat.forEach((latency, rep) => {
      const b = bundle(c.hash, c.ref, rep, latency);
      const [experiment, arm, mode] = c.ref.split('/');
      db.prepare('insert into runs values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(c.hash, rep, c.ref, experiment!, arm!, mode!, c.host, '2026-10-12T01:00:00Z', 0.5, JSON.stringify(b.run));
      db.prepare('insert into run_bundles values (?, ?, ?, ?, ?, ?)').run(c.hash, rep, pack(b.entities), pack(b.links), b.entities.length, b.links.length);
    });

  // the evidence archive, as Perf Lab keeps it: the .tar.gz named by its hash, plus its row
  const archive = cocoArchive();
  const archiveSha = sha256(archive);
  mkdirSync(join(dir, 'evidence'), { recursive: true });
  writeFileSync(join(dir, 'evidence', `${archiveSha}.tar.gz`), archive);
  const files = [
    { path: 'qualification/coco/fixture-provenance.json', bytes: 0 },
    { path: 'qualification/coco/instances_selected.json', bytes: 0 },
    { path: 'qualification/reports/paired.json', bytes: Buffer.byteLength('{"results":[]}') },
  ];
  const { manifest, provenance, datasetId } = cocoManifest();
  files[0]!.bytes = Buffer.byteLength(JSON.stringify(provenance));
  files[1]!.bytes = Buffer.byteLength(manifest);
  db.prepare('insert into evidence_archives values (?, ?, ?, ?, ?)').run(archiveSha, 'fixture-archive', archive.byteLength, JSON.stringify(files), '2026-10-12T02:00:00.000Z');
  db.prepare('insert into datasets values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    datasetId, 'fixture-archive · COCO selection', 'coco', 'public', `evidence:${archiveSha}`, JSON.stringify(provenance), JSON.stringify(['person', 'chair']), 2, 2, '2026-10-12T02:00:00.001Z',
  );
  const image = db.prepare('insert into dataset_images values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  image.run(datasetId, 1993, '000000001993.jpg', sha256(IMAGES[1993]), 640, 419, 'Attribution License', 'http://creativecommons.org/licenses/by/2.0/', 'http://images.cocodataset.org/val2017/000000001993.jpg', 'http://example/1993', JSON.stringify([{ category: 'chair', size: 'large' }]));
  image.run(datasetId, 7088, '000000007088.jpg', sha256(IMAGES[7088]), 500, 375, 'Attribution License', 'http://creativecommons.org/licenses/by/2.0/', 'http://images.cocodataset.org/val2017/000000007088.jpg', null, '[]');
  const ann = db.prepare('insert into dataset_annotations values (?, ?, ?, ?, ?, ?, ?)');
  ann.run(datasetId, 1, 1993, 'chair', '[111,247.7,118.5,170.6]', 20000, 0);
  ann.run(datasetId, 2, 7088, 'person', '[10,10,50,100]', 5000, 1);

  mkdirSync(join(dir, 'media'), { recursive: true });
  const media = [IMAGES[1993], IMAGES[7088]].map((bytes) => {
    const hash = sha256(bytes);
    writeFileSync(join(dir, 'media', `${hash}.jpg`), bytes);
    db.prepare(`insert into media values (?, ?, 'image/jpeg', 'public', ?, '2026-10-12T02:01:00.000Z')`).run(hash, bytes.byteLength, 'https://s3.amazonaws.com/images.cocodataset.org/val2017/x.jpg');
    return hash;
  });

  const job = db.prepare('insert into jobs values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  job.run('job-done-0001', 'sampler', 'done', 'user', 'measure both arms', 'local', 3.8, 1, '2026-10-12T00:59:00.000Z', '2026-10-12T00:59:00.001Z', '2026-10-12T01:00:05.000Z', null);
  job.run('job-left-0002', 'sampler', 'running', 'assistant', 'left running', 'local', 1, 0.5, '2026-10-12T03:00:00.000Z', '2026-10-12T03:00:01.000Z', null, null);
  const jc = db.prepare('insert into job_captures values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const c of [local, candidate]) jc.run('job-done-0001', c.hash, c.ref, 'sampler-test', c.ref.split('/')[1]!, 'timing', 'local', 2, JSON.stringify(c.spec), 'imported', null);
  jc.run('job-left-0002', local.hash, local.ref, 'sampler-test', 'baseline', 'timing', 'local', 2, JSON.stringify(local.spec), 'running', null);
  const ev = db.prepare('insert into job_events (job_id, at, kind, detail) values (?, ?, ?, ?)');
  ev.run('job-done-0001', '2026-10-12T00:59:00.000Z', 'job.proposed', 'measure both arms');
  ev.run('job-left-0002', '2026-10-12T03:00:00.000Z', 'job.proposed', 'left running');
  ev.run('job-done-0001', '2026-10-12T00:59:00.001Z', 'job.approved', null);
  ev.run('job-done-0001', '2026-10-12T01:00:05.000Z', 'job.done', null);

  db.prepare('insert into programs values (?, ?, ?, ?)').run('sampler', 'lab("sampler")', 'preset-1', '2026-10-12T04:00:00.000Z');
  db.prepare('insert into annotations (lab_id, target, kind, body_json, author, created_at) values (?, ?, ?, ?, ?, ?)').run('sampler', 'kernel:k1', 'note', '{"text":"slow"}', 'user', '2026-10-12T04:00:01.000Z');
  db.prepare('insert into conversations values (?, ?, ?, ?, ?, ?)').run('c1', 'sampler', 'b1', 'x', 'x', null);
  db.prepare('insert into messages values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('m1', 'c1', 1, 'user', 'live', 'hello', null, null, null, 'x');
  db.prepare('insert into llm_calls (conversation_id, provider, model, duration_ms, created_at) values (?, ?, ?, ?, ?)').run('c1', 'p', 'm', 10, 'x');

  return { dir, db, local, candidate, synthetic, archive, archiveSha, datasetId, media };
}
