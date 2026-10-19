// Measurement records in SQLite (guide §21, §30.3). Every record is validated with @kiln/evidence, which recomputes
// its id: a record whose content does not hash to its id is rejected, so a stored record is exactly what was measured.
//
// The content id (§22) is NOT recomputed here: a record carries the source hash and the launch, but not the input
// shapes, input seeds or output shape that the content id also covers. The server recomputes content ids where it
// holds the whole kernel description: when a job is created (jobs.ts), and so for every record a job produces.
import { validateRecord, type MeasurementRecord } from '@kiln/evidence';
import { all, get, run, tx, type Db } from './db.ts';

export interface InsertResult {
  added: number;
  duplicates: number;
  rejected: { id: string | null; reason: string }[];
  /** ids of the records added */
  ids: string[];
}

export const MAX_RECORDS_PER_POST = 10_000;

/** Validate and store records; the same id is stored once. One transaction. */
export function insertRecords(db: Db, records: readonly unknown[], { jobId = null }: { jobId?: string | null } = {}): InsertResult {
  const out: InsertResult = { added: 0, duplicates: 0, rejected: [], ids: [] };
  const ins = db.prepare(
    'insert or ignore into records (id, at, device_id, device_class, identity, row, content_id, kind, ok, by, job_id, json) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  tx(db, () => {
    for (const x of records) {
      const v = validateRecord(x);
      if (!v.ok) {
        const id = typeof (x as { id?: unknown })?.id === 'string' ? (x as { id: string }).id : null;
        out.rejected.push({ id, reason: v.errors.slice(0, 3).join('; ') });
        continue;
      }
      const r = v.record;
      const res = ins.run(r.id, r.at, r.device.id, r.device.class, r.kernel.identity, r.kernel.row, r.kernel.contentId, r.timing.kind, r.validity.ok ? 1 : 0, r.by, jobId, JSON.stringify(r));
      if (res.changes === 0) {
        out.duplicates++;
        continue;
      }
      out.added++;
      out.ids.push(r.id);
      upsertDevice(db, r.device, r.at);
    }
  });
  return out;
}

export interface RecordFilter {
  device?: string | undefined;
  identity?: string | undefined;
  /** ISO 8601: records measured after this instant */
  since?: string | undefined;
  job?: string | undefined;
}

export function listRecords(db: Db, f: RecordFilter = {}): MeasurementRecord[] {
  const where: string[] = [], params: string[] = [];
  if (f.device) where.push('device_id = ?'), params.push(f.device);
  if (f.identity) where.push('identity = ?'), params.push(f.identity);
  if (f.since) where.push('at > ?'), params.push(f.since);
  if (f.job) where.push('job_id = ?'), params.push(f.job);
  const sql = `select json from records${where.length ? ` where ${where.join(' and ')}` : ''} order by at, id`;
  return all<{ json: string }>(db, sql, ...params).map((r) => JSON.parse(r.json) as MeasurementRecord);
}

/** "Forget device": its records and its row. */
export function deleteRecords(db: Db, device: string): number {
  return tx(db, () => {
    const n = Number(run(db, 'delete from records where device_id = ?', device).changes);
    run(db, 'delete from devices where id = ?', device);
    return n;
  });
}

export const recordIdsOfJob = (db: Db, job: string): string[] => all<{ id: string }>(db, 'select id from records where job_id = ? order by at, id', job).map((r) => r.id);

export const countRecords = (db: Db, device: string): number => get<{ n: number }>(db, 'select count(*) as n from records where device_id = ?', device)?.n ?? 0;

/** Note a device seen in a record or a probe; first_seen and last_seen bound the times it was seen. */
export function upsertDevice(db: Db, d: { id: string; class: string; name: string; fingerprint: object }, at: string): void {
  run(
    db,
    `insert into devices (id, class, name, fingerprint_json, first_seen, last_seen) values (?, ?, ?, ?, ?, ?)
     on conflict (id) do update set
       name = excluded.name, fingerprint_json = excluded.fingerprint_json,
       first_seen = min(first_seen, excluded.first_seen), last_seen = max(last_seen, excluded.last_seen)`,
    d.id, d.class, d.name, JSON.stringify(d.fingerprint), at, at,
  );
}
