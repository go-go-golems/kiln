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
