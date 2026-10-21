// SQLite storage (guide §30.7) through Node's built-in node:sqlite. Migrations are an ordered array applied once
// each inside a transaction (Perf Lab's pattern, PL/server/db.ts): never edit an applied one, append a new one.
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

export type Db = DatabaseSync;

// Three columns beyond the guide's schema: records.job_id (the job that produced a record, for the Jobs view), and
// jobs.started_at and jobs.executor_ms (when a job ran and the executor time it spent: the agents' daily budget).
const MIGRATIONS: string[] = [
  `
  create table records (
    id           text primary key,
    at           text not null,
    device_id    text not null,
    device_class text not null,
    identity     text not null,
    row          text not null,
    content_id   text not null,
    kind         text not null,
    ok           integer not null,
    by           text not null,
    job_id       text,
    json         text not null
  );
  create index records_lookup on records (device_id, identity);
  create index records_job on records (job_id);

  create table devices (
    id               text primary key,
    class            text not null,
    name             text not null,
    fingerprint_json text not null,
    first_seen       text not null,
    last_seen        text not null
  );

  create table sources (
    sha256 text primary key,
    lang   text not null,
    text   text not null
  );

  create table jobs (
    id          text primary key,
    status      text not null check (status in ('proposed', 'approved', 'running', 'done', 'failed', 'cancelled')),
    proposed_by text not null check (proposed_by in ('user', 'agent')),
    executor    text not null,
    reason      text not null,
    spec_json   text not null,
    spec_sha256 text not null,
    created_at  text not null,
    approved_at text,
    started_at  text,
    finished_at text,
    executor_ms integer not null default 0,
    error       text
  );

  create table job_events (
    id     integer primary key autoincrement,
    job_id text not null references jobs (id) on delete cascade,
    at     text not null,
    kind   text not null,
    detail text not null
  );
  create index job_events_job on job_events (job_id);

  create table llm_calls (
    id                integer primary key autoincrement,
    conversation      text,
    model             text,
    input_tokens      integer,
    output_tokens     integer,
    reasoning_tokens  integer,
    cache_read_tokens integer,
    est_prompt_tokens integer,
    duration_ms       integer,
    stop_reason       text,
    error             text,
    created_at        text not null
  );
  `,
  // 2: Perf Lab's data (guide §33.3; src/lab/), with its schema after Perf Lab's migration 5 (PL/server/db.ts) and a
  // lab_ prefix, because Kiln already has jobs, job_events and llm_calls. Perf Lab's transcripts (conversations,
  // messages, llm_calls) are not lab data and have no table here. Content addresses are checked to be lowercase
  // SHA-256 hex in the schema, so a file path built from one cannot leave its directory, whoever wrote the row.
  `
  create table lab_programs (
    lab_id      text primary key,
    source      text not null,
    preset_hash text,
    updated_at  text not null
  );

  create table lab_artifacts (
    hash        text primary key,
    lab_id      text not null,
    experiment  text not null,
    arm         text not null,
    mode        text not null,
    host        text not null,
    reps        integer not null,
    spec_json   text not null,
    origin      text not null check (origin in ('synthetic', 'measured')),
    status      text not null check (status in ('running', 'available', 'failed')),
    created_at  text not null,
    imported_at text,
    source      text
  );
  create index lab_artifacts_lab on lab_artifacts (lab_id);

  create table lab_runs (
    hash        text not null references lab_artifacts (hash) on delete cascade,
    rep         integer not null,
    ref         text not null,
    experiment  text not null,
    arm         text not null,
    mode        text not null,
    host        text not null,
    started_at  text,
    duration_s  real,
    run_json    text not null,
    primary key (hash, rep)
  );
  create index lab_runs_ref on lab_runs (ref);

  create table lab_run_bundles (
    hash        text not null,
    rep         integer not null,
    entities    blob not null,
    links       blob not null,
    n_entities  integer not null,
    n_links     integer not null,
    primary key (hash, rep),
    foreign key (hash, rep) references lab_runs (hash, rep) on delete cascade
  );

  create table lab_jobs (
    id              text primary key,
    lab_id          text not null,
    status          text not null check (status in ('proposed', 'approved', 'running', 'importing', 'done', 'failed', 'cancelled')),
    proposed_by     text not null check (proposed_by in ('user', 'assistant')),
    reason          text not null,
    hosts           text not null,
    budget_gpu_min  real not null,
    progress        real not null default 0,
    created_at      text not null,
    approved_at     text,
    finished_at     text,
    error           text
  );

  create table lab_job_captures (
    job_id      text not null references lab_jobs (id) on delete cascade,
    hash        text not null,
    ref         text not null,
    experiment  text not null,
    arm         text not null,
    mode        text not null,
    host        text not null,
    reps        integer not null,
    spec_json   text not null,
    status      text not null default 'pending',
    error       text,
    primary key (job_id, hash)
  );

  create table lab_job_events (
    id      integer primary key autoincrement,
    job_id  text not null references lab_jobs (id) on delete cascade,
    at      text not null,
    kind    text not null,
    detail  text
  );
  create index lab_job_events_job on lab_job_events (job_id, id);

  create table lab_annotations (
    id          integer primary key autoincrement,
    lab_id      text not null,
    target      text not null,
    kind        text not null,
    body_json   text not null,
    author      text not null check (author in ('user', 'assistant')),
    created_at  text not null
  );
  create index lab_annotations_lab on lab_annotations (lab_id);

  create table lab_evidence_archives (
    sha256      text primary key check (length(sha256) = 64 and sha256 not glob '*[^0-9a-f]*'),
    name        text not null,
    bytes       integer not null,
    files_json  text not null,
    added_at    text not null
  );

  create table lab_datasets (
    id                text primary key check (length(id) = 64 and id not glob '*[^0-9a-f]*'),
    name              text not null,
    format            text not null check (format in ('coco')),
    privacy           text not null check (privacy in ('public')),
    source            text not null,
    provenance_json   text not null,
    categories_json   text not null,
    image_count       integer not null,
    annotation_count  integer not null,
    added_at          text not null
  );

  create table lab_dataset_images (
    dataset_id    text not null references lab_datasets (id) on delete cascade,
    image_id      integer not null,
    file_name     text not null,
    sha256        text not null check (length(sha256) = 64 and sha256 not glob '*[^0-9a-f]*'),
    width         integer not null,
    height        integer not null,
    license_name  text,
    license_url   text,
    source_url    text not null,
    page_url      text,
    strata_json   text not null,
    primary key (dataset_id, image_id)
  );
  create index lab_dataset_images_sha on lab_dataset_images (sha256);

  create table lab_dataset_annotations (
    dataset_id  text not null references lab_datasets (id) on delete cascade,
    id          integer not null,
    image_id    integer not null,
    category    text not null,
    bbox_json   text not null,
    area        real not null,
    iscrowd     integer not null,
    primary key (dataset_id, id)
  );
  create index lab_dataset_annotations_image on lab_dataset_annotations (dataset_id, image_id);

  create table lab_media (
    sha256      text primary key check (length(sha256) = 64 and sha256 not glob '*[^0-9a-f]*'),
    bytes       integer not null,
    mime        text not null check (mime in ('image/jpeg', 'image/png')),
    privacy     text not null check (privacy in ('public')),
    source_url  text,
    added_at    text not null
  );
  `,
  // 3: one execution core (KILN-003 §23.5). One job table for every kind of work, whose captures are rows of
  // job_captures; Perf Lab's job tables go (their runs and archives stay); lab_artifacts, lab_runs and lab_run_bundles
  // become the catalog of every capture, executed here or imported (synthetic stand-ins are deleted). A capture is
  // keyed by its identity (kiln-capture/1); lab_hash is the lab's own name for it, which lab programs look up;
  // lab_evidence_archives becomes archives, which also holds every job's result archive. Kiln's job history is not
  // carried over: its records keep their job ids.
  `
  drop table lab_job_events;
  drop table lab_job_captures;
  drop table lab_jobs;
  drop table job_events;
  drop table jobs;

  create table jobs (
    id             text primary key,
    status         text not null check (status in ('proposed', 'approved', 'running', 'importing', 'done', 'failed', 'cancelled')),
    proposed_by    text not null check (proposed_by in ('user', 'agent')),
    host           text not null,
    reason         text not null,
    spec_json      text not null,
    spec_sha256    text not null,
    plan_sha256    text,
    archive_sha256 text,
    result_json    text,
    created_at     text not null,
    approved_at    text,
    submitted_at   text,
    started_at     text,
    finished_at    text,
    executor_ms    integer not null default 0,
    driver_seq     integer not null default 0,
    error          text
  );
  create index jobs_host on jobs (host, status);

  create table job_events (
    id     integer primary key autoincrement,
    job_id text not null references jobs (id) on delete cascade,
    at     text not null,
    kind   text not null,
    detail text not null
  );
  create index job_events_job on job_events (job_id);

  create table job_captures (
    job_id          text not null references jobs (id) on delete cascade,
    seq             integer not null,
    idx             integer,
    capture         text,
    kind            text not null,
    pair_id         text not null,
    mode            text not null,
    collectors_json text not null,
    label           text not null,
    verdict         text not null check (verdict in ('execute', 'cached', 'blocked')),
    reason          text,
    primary key (job_id, seq)
  );
  create index job_captures_capture on job_captures (capture);

  create table captures (
    hash        text primary key,
    kind        text,
    lab_id      text,
    lab_hash    text,
    experiment  text not null,
    arm         text not null,
    mode        text not null,
    host        text not null,
    reps        integer not null,
    spec_json   text not null,
    origin      text not null check (origin in ('executed', 'imported')),
    status      text not null check (status in ('running', 'available', 'failed')),
    created_at  text not null,
    imported_at text,
    source      text,
    job_id      text
  );
  insert into captures (hash, kind, lab_id, lab_hash, experiment, arm, mode, host, reps, spec_json, origin, status, created_at, imported_at, source)
    select hash, null, lab_id, hash, experiment, arm, mode, host, reps, spec_json, 'imported', status, created_at, imported_at, source from lab_artifacts where origin = 'measured';
  create index captures_lab on captures (lab_id);
  create index captures_lab_hash on captures (lab_hash);
  create index captures_job on captures (job_id);

  create table runs (
    hash        text not null references captures (hash) on delete cascade,
    rep         integer not null,
    ref         text not null,
    experiment  text not null,
    arm         text not null,
    mode        text not null,
    host        text not null,
    started_at  text,
    duration_s  real,
    run_json    text not null,
    primary key (hash, rep)
  );
  insert into runs select r.* from lab_runs r join captures c on c.hash = r.hash;
  create index runs_ref on runs (ref);

  create table run_bundles (
    hash        text not null,
    rep         integer not null,
    entities    blob not null,
    links       blob not null,
    n_entities  integer not null,
    n_links     integer not null,
    primary key (hash, rep),
    foreign key (hash, rep) references runs (hash, rep) on delete cascade
  );
  insert into run_bundles select b.* from lab_run_bundles b join runs r on r.hash = b.hash and r.rep = b.rep;

  drop table lab_run_bundles;
  drop table lab_runs;
  drop table lab_artifacts;

  alter table lab_evidence_archives rename to archives;
  alter table archives add column job_id text;

  alter table devices add column spec_json text;
  alter table devices add column host text;
  `,
];

export function openDb(file: string): Db {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('pragma foreign_keys = on; pragma busy_timeout = 5000;');
  if (file !== ':memory:') db.exec('pragma journal_mode = wal;');
  migrate(db);
  return db;
}

/** Applies the migrations not yet applied; returns their version numbers. */
export function migrate(db: Db): number[] {
  db.exec('create table if not exists schema_migrations (version integer primary key, applied_at text not null)');
  const applied = new Set(all<{ version: number }>(db, 'select version from schema_migrations').map((r) => r.version));
  const ran: number[] = [];
  MIGRATIONS.forEach((sql, i) => {
    const version = i + 1;
    if (applied.has(version)) return;
    tx(db, () => {
      db.exec(sql);
      run(db, 'insert into schema_migrations (version, applied_at) values (?, ?)', version, now());
    });
    ran.push(version);
  });
  return ran;
}

/** Runs fn inside a transaction; rolls back and rethrows on error. */
export function tx<T>(db: Db, fn: () => T): T {
  db.exec('begin');
  try {
    const out = fn();
    db.exec('commit');
    return out;
  } catch (e) {
    db.exec('rollback');
    throw e;
  }
}

export const now = () => new Date().toISOString();
export const all = <T>(db: Db, sql: string, ...params: SQLInputValue[]) => db.prepare(sql).all(...params) as T[];
export const get = <T>(db: Db, sql: string, ...params: SQLInputValue[]) => db.prepare(sql).get(...params) as T | undefined;
export const run = (db: Db, sql: string, ...params: SQLInputValue[]) => db.prepare(sql).run(...params);
