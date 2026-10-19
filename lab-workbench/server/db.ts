import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

export type Db = DatabaseSync;

/**
 * Numbered migrations, applied in order inside one transaction each. Never edit an applied migration;
 * append a new one.
 */
const MIGRATIONS: string[] = [
  `
  create table programs (
    lab_id      text primary key,
    source      text not null,
    preset_hash text,
    updated_at  text not null
  );

  create table artifacts (
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
    imported_at text
  );
  create index artifacts_lab on artifacts (lab_id);

  create table runs (
    ref         text primary key,
    hash        text not null references artifacts (hash) on delete cascade,
    rep         integer not null,
    experiment  text not null,
    arm         text not null,
    mode        text not null,
    host        text not null,
    started_at  text,
    duration_s  real,
    run_json    text not null
  );
  create index runs_hash on runs (hash);

  create table run_bundles (
    run_ref     text primary key references runs (ref) on delete cascade,
    entities    blob not null,
    links       blob not null,
    n_entities  integer not null,
    n_links     integer not null
  );

  create table jobs (
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

  create table job_captures (
    job_id      text not null references jobs (id) on delete cascade,
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

  create table job_events (
    id      integer primary key autoincrement,
    job_id  text not null references jobs (id) on delete cascade,
    at      text not null,
    kind    text not null,
    detail  text
  );
  create index job_events_job on job_events (job_id, id);

  create table annotations (
    id          integer primary key autoincrement,
    lab_id      text not null,
    target      text not null,
    kind        text not null,
    body_json   text not null,
    author      text not null,
    created_at  text not null
  );
  create index annotations_lab on annotations (lab_id);

  create table conversations (
    id          text primary key,
    lab_id      text not null,
    board_id    text not null,
    created_at  text not null,
    updated_at  text not null,
    unique (lab_id, board_id)
  );

  create table messages (
    id               text primary key,
    conversation_id  text not null references conversations (id) on delete cascade,
    seq              integer not null,
    role             text not null check (role in ('user', 'assistant', 'observation')),
    mode             text not null check (mode in ('scripted', 'live')),
    content          text not null,
    code             text,
    result_json      text,
    status           text,
    created_at       text not null,
    unique (conversation_id, seq)
  );

  create table llm_calls (
    id                  integer primary key autoincrement,
    conversation_id     text not null references conversations (id) on delete cascade,
    message_id          text references messages (id) on delete set null,
    provider            text not null,
    model               text not null,
    thinking            text,
    input_tokens        integer,
    output_tokens       integer,
    reasoning_tokens    integer,
    cache_read_tokens   integer,
    cache_write_tokens  integer,
    total_tokens        integer,
    duration_ms         integer not null,
    stop_reason         text,
    error               text,
    created_at          text not null
  );
  create index llm_calls_conversation on llm_calls (conversation_id);
  `,
  // the gateway's reported input tokens exclude system-role content; keep what was sent and an estimate
  `
  alter table llm_calls add column prompt_chars integer;
  alter table llm_calls add column est_prompt_tokens integer;
  `,
  // A run is identified by its capture hash and repetition. The reference experiment/arm/mode#rep is the
  // same for every parameter value, so keying on it let a run for one value overwrite another's (found
  // 2026-10-12: the queries=1024 runs replaced the queries=2048 rows). Artifacts that lost runs that way
  // are marked failed, so the plan shows them as missing again instead of as empty.
  `
  create table runs_v3 (
    hash        text not null references artifacts (hash) on delete cascade,
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
  insert into runs_v3 (hash, rep, ref, experiment, arm, mode, host, started_at, duration_s, run_json)
    select hash, rep, ref, experiment, arm, mode, host, started_at, duration_s, run_json from runs;
  create table run_bundles_v3 (
    hash        text not null,
    rep         integer not null,
    entities    blob not null,
    links       blob not null,
    n_entities  integer not null,
    n_links     integer not null,
    primary key (hash, rep),
    foreign key (hash, rep) references runs_v3 (hash, rep) on delete cascade
  );
  insert into run_bundles_v3 (hash, rep, entities, links, n_entities, n_links)
    select r.hash, r.rep, b.entities, b.links, b.n_entities, b.n_links from run_bundles b join runs r on r.ref = b.run_ref;
  drop table run_bundles;
  drop table runs;
  alter table runs_v3 rename to runs;
  alter table run_bundles_v3 rename to run_bundles;
  create index runs_ref on runs (ref);
  update artifacts set status = 'failed'
    where origin = 'measured' and status = 'available' and (select count(*) from runs r where r.hash = artifacts.hash) < reps;
  `,
  // Clearing a transcript archives it, so a board can have many conversations: at most one active (a partial
  // unique index), the rest archived for the library. All three tables are rebuilt and the children dropped
  // first, because dropping a parent with foreign keys on would cascade-delete its messages.
  `
  create table conversations_v4 (
    id           text primary key,
    lab_id       text not null,
    board_id     text not null,
    created_at   text not null,
    updated_at   text not null,
    archived_at  text
  );
  insert into conversations_v4 (id, lab_id, board_id, created_at, updated_at)
    select id, lab_id, board_id, created_at, updated_at from conversations;
  create table messages_v4 (
    id               text primary key,
    conversation_id  text not null references conversations_v4 (id) on delete cascade,
    seq              integer not null,
    role             text not null check (role in ('user', 'assistant', 'observation')),
    mode             text not null check (mode in ('scripted', 'live')),
    content          text not null,
    code             text,
    result_json      text,
    status           text,
    created_at       text not null,
    unique (conversation_id, seq)
  );
  insert into messages_v4 select id, conversation_id, seq, role, mode, content, code, result_json, status, created_at from messages;
  create table llm_calls_v4 (
    id                  integer primary key autoincrement,
    conversation_id     text not null references conversations_v4 (id) on delete cascade,
    message_id          text references messages_v4 (id) on delete set null,
    provider            text not null,
    model               text not null,
    thinking            text,
    input_tokens        integer,
    output_tokens       integer,
    reasoning_tokens    integer,
    cache_read_tokens   integer,
    cache_write_tokens  integer,
    total_tokens        integer,
    duration_ms         integer not null,
    stop_reason         text,
    error               text,
    created_at          text not null,
    prompt_chars        integer,
    est_prompt_tokens   integer
  );
  insert into llm_calls_v4 select id, conversation_id, message_id, provider, model, thinking, input_tokens, output_tokens, reasoning_tokens,
    cache_read_tokens, cache_write_tokens, total_tokens, duration_ms, stop_reason, error, created_at, prompt_chars, est_prompt_tokens from llm_calls;
  drop table llm_calls;
  drop table messages;
  drop table conversations;
  alter table conversations_v4 rename to conversations;
  alter table messages_v4 rename to messages;
  alter table llm_calls_v4 rename to llm_calls;
  create unique index conversations_active on conversations (lab_id, board_id) where archived_at is null;
  create index conversations_lab on conversations (lab_id, updated_at);
  create index llm_calls_conversation on llm_calls (conversation_id);
  create index llm_calls_message on llm_calls (message_id);
  `,
  // 5: evidence archives, datasets and public media (ML-PERF-002). An artifact imported from an archive keeps
  // origin 'measured' (it was measured, on another host) and names the archive in source.
  `
  alter table artifacts add column source text;

  create table evidence_archives (
    sha256      text primary key,
    name        text not null,
    bytes       integer not null,
    files_json  text not null,
    added_at    text not null
  );

  create table datasets (
    id                text primary key,
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

  create table dataset_images (
    dataset_id    text not null references datasets (id) on delete cascade,
    image_id      integer not null,
    file_name     text not null,
    sha256        text not null,
    width         integer not null,
    height        integer not null,
    license_name  text,
    license_url   text,
    source_url    text not null,
    page_url      text,
    strata_json   text not null,
    primary key (dataset_id, image_id)
  );
  create index dataset_images_sha on dataset_images (sha256);

  create table dataset_annotations (
    dataset_id  text not null references datasets (id) on delete cascade,
    id          integer not null,
    image_id    integer not null,
    category    text not null,
    bbox_json   text not null,
    area        real not null,
    iscrowd     integer not null,
    primary key (dataset_id, id)
  );
  create index dataset_annotations_image on dataset_annotations (dataset_id, image_id);

  create table media (
    sha256      text primary key,
    bytes       integer not null,
    mime        text not null,
    privacy     text not null check (privacy in ('public')),
    source_url  text,
    added_at    text not null
  );
  `,
];

export function openDb(file: string): Db {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('pragma journal_mode = wal; pragma foreign_keys = on; pragma busy_timeout = 5000;');
  migrate(db);
  return db;
}

export function migrate(db: Db): number[] {
  db.exec('create table if not exists schema_migrations (version integer primary key, applied_at text not null)');
  const applied = new Set((db.prepare('select version from schema_migrations').all() as { version: number }[]).map((r) => r.version));
  const ran: number[] = [];
  MIGRATIONS.forEach((sql, i) => {
    const version = i + 1;
    if (applied.has(version)) return;
    tx(db, () => {
      db.exec(sql);
      db.prepare('insert into schema_migrations (version, applied_at) values (?, ?)').run(version, now());
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
