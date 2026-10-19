import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { all, get } from '../src/db.ts';
import { sha256 } from '../src/lab/files.ts';
import { importPerfLab, refusedCount, type ImportSummary } from '../src/lab/importer.ts';
import { IMAGES, makePerfLabDir } from './support/lab.ts';
import { makeServer, tempDir } from './support/server.ts';

const SERVER = fileURLToPath(new URL('..', import.meta.url));
const LAB_TABLES = ['lab_programs', 'lab_artifacts', 'lab_runs', 'lab_run_bundles', 'lab_jobs', 'lab_job_captures', 'lab_job_events', 'lab_annotations', 'lab_evidence_archives', 'lab_datasets', 'lab_dataset_images', 'lab_dataset_annotations', 'lab_media'];

/** Every file under a directory, with its SHA-256 and modification time. */
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[relative(dir, p)] = `${sha256(readFileSync(p))} ${statSync(p).mtimeMs}`;
    }
  };
  walk(dir);
  return out;
}

const counts = (s: ImportSummary) => Object.fromEntries((['datasets', 'archives', 'media', 'artifacts', 'runs', 'jobs', 'programs', 'annotations'] as const).map((k) => [k, [s[k].added, s[k].present, s[k].refused.length]]));
const rows = (db: DatabaseSync) => Object.fromEntries(LAB_TABLES.map((t) => [t, get<{ n: number }>(db, `select count(*) as n from ${t}`)!.n]));

function setup() {
  const pl = makePerfLabDir();
  const s = makeServer({ executors: [] });
  const imp = () => importPerfLab({ source: pl.dir, db: s.db, dataDir: s.config.dataDir });
  return { pl, s, imp };
}

describe('the Perf Lab importer', () => {
  it('imports a Perf Lab data directory, which the lab routes then serve in Perf Lab\'s shapes', async () => {
    const { pl, s, imp } = setup();
    pl.db.close();
    const sum = imp();
    expect(counts(sum)).toEqual({ datasets: [1, 0, 0], archives: [1, 0, 0], media: [2, 0, 0], artifacts: [3, 0, 0], runs: [4, 0, 0], jobs: [2, 0, 0], programs: [1, 0, 0], annotations: [1, 0, 0] });
    expect(sum.bytes).toEqual({ archives: pl.archive.byteLength, media: IMAGES[1993].byteLength + IMAGES[7088].byteLength });
    expect(sum.notImported).toEqual({ conversations: 1, messages: 1, llm_calls: 1 });
    expect(sum.notes).toEqual(['job job-left-0002 was running in Perf Lab and is imported as failed']);

    const cat = (await s.json('GET', '/api/lab/catalog')).body;
    expect(cat[pl.local.hash]).toEqual({ origin: 'measured', source: null, ref: 'sampler-test/baseline/timing', host: 'local', reps: 2, labId: 'sampler', importedAt: '2026-10-12T01:00:00.000Z' });
    expect(cat[pl.synthetic.hash]).toMatchObject({ origin: 'synthetic', host: 'playback@dgx' });
    const bundles = (await s.json('GET', `/api/lab/bundles?hashes=${pl.candidate.hash}`)).body[pl.candidate.hash];
    expect(bundles.map((b: any) => b.entities[0].latency)).toEqual([1, 1.25]);
    expect(bundles[0].entities[1].userTime.__value).toBe(true);

    const archives = (await s.json('GET', '/api/lab/evidence')).body;
    expect(archives).toEqual([expect.objectContaining({ sha256: pl.archiveSha, name: 'fixture-archive', bytes: pl.archive.byteLength, addedAt: '2026-10-12T02:00:00.000Z', datasets: [pl.datasetId] })]);
    expect(archives[0].files.map((f: any) => f.path)).toEqual(['qualification/coco/fixture-provenance.json', 'qualification/coco/instances_selected.json', 'qualification/reports/paired.json']);
    const ds = (await s.json('GET', `/api/lab/datasets/${pl.datasetId}`)).body;
    expect(ds).toMatchObject({ name: 'fixture-archive · COCO selection', imageCount: 2, annotationCount: 2, present: 2, addedAt: '2026-10-12T02:00:00.001Z' });
    expect(ds.images.map((i: any) => [i.imageId, i.negative, i.present])).toEqual([[1993, false, true], [7088, true, true]]);
    for (const m of pl.media) {
      const r = await s.call('GET', `/api/lab/media/${m}`);
      expect([r.status, r.headers.get('content-type'), sha256(new Uint8Array(await r.arrayBuffer()))]).toEqual([200, 'image/jpeg', m]);
    }

    const done = (await s.json('GET', '/api/lab/jobs/job-done-0001')).body;
    expect(done).toMatchObject({ status: 'done', proposed_by: 'user', budget_gpu_min: 3.8, finished_at: '2026-10-12T01:00:05.000Z', error: null });
    expect(done.captures.map((c: any) => [c.hash, c.status])).toEqual([[pl.local.hash, 'imported'], [pl.candidate.hash, 'imported']]);
    expect(done.events.map((e: any) => [e.at, e.kind, e.detail])).toEqual([
      ['2026-10-12T00:59:00.000Z', 'job.proposed', 'measure both arms'],
      ['2026-10-12T00:59:00.001Z', 'job.approved', null],
      ['2026-10-12T01:00:05.000Z', 'job.done', null],
    ]);
    const left = (await s.json('GET', '/api/lab/jobs/job-left-0002')).body;
    expect(left).toMatchObject({ status: 'failed', proposed_by: 'assistant', error: 'not finished when imported from Perf Lab', finished_at: expect.any(String) });
    expect(left.events.map((e: any) => e.kind)).toEqual(['job.proposed', 'job.failed']);

    expect((await s.json('GET', '/api/lab/programs/sampler')).body).toEqual({ labId: 'sampler', source: 'lab("sampler")', presetHash: 'preset-1', updatedAt: '2026-10-12T04:00:00.000Z' });
    expect((await s.json('GET', '/api/lab/annotations?lab=sampler')).body).toEqual([{ id: 1, lab_id: 'sampler', target: 'kernel:k1', kind: 'note', body: { text: 'slow' }, author: 'user', created_at: '2026-10-12T04:00:01.000Z' }]);
    // the transcripts have no table here, and Kiln's own llm_calls is untouched
    expect(get(s.db, `select count(*) as n from sqlite_master where name in ('conversations', 'messages')`)).toEqual({ n: 0 });
    expect(get(s.db, 'select count(*) as n from llm_calls')).toEqual({ n: 0 });
  });

  it('is idempotent: a second run adds nothing, writes nothing and changes nothing', () => {
    const { pl, s, imp } = setup();
    pl.db.close();
    imp();
    const before = { rows: rows(s.db), files: snapshot(join(s.config.dataDir, 'lab')) };
    const again = imp();
    expect(counts(again)).toEqual({ datasets: [0, 1, 0], archives: [0, 1, 0], media: [0, 2, 0], artifacts: [0, 3, 0], runs: [0, 4, 0], jobs: [0, 2, 0], programs: [0, 1, 0], annotations: [0, 1, 0] });
    expect(again.bytes).toEqual({ archives: 0, media: 0 });
    expect(again.notes).toEqual([]);
    expect({ rows: rows(s.db), files: snapshot(join(s.config.dataDir, 'lab')) }).toEqual(before);
  });

  it('opens the source read-only and writes nothing under it, even when it is not writable', () => {
    const { pl, s, imp } = setup();
    pl.db.close();
    const before = snapshot(pl.dir);
    const dirs = [pl.dir, join(pl.dir, 'media'), join(pl.dir, 'evidence')];
    for (const f of Object.keys(before)) chmodSync(join(pl.dir, f), 0o444);
    for (const d of dirs) chmodSync(d, 0o555);
    try {
      expect(refusedCount(imp())).toBe(0);
    } finally {
      for (const d of dirs) chmodSync(d, 0o755);
    }
    expect(snapshot(pl.dir)).toEqual(before);
    expect(readdirSync(pl.dir).sort()).toEqual(['evidence', 'media', 'perf-lab.sqlite']);
  });

  it('changes no byte or timestamp of a WAL-mode source left with its -wal and -shm, as Perf Lab leaves it', () => {
    const { pl, imp } = setup();
    // Perf Lab runs its database in WAL mode. With no writer attached, a read-only open in place rebuilds the -shm
    // index (its bytes and its time change); the importer must open a copy instead
    pl.db.exec('PRAGMA journal_mode = WAL');
    pl.db.exec('create table wal_probe (x)');
    const held = mkdtempSync(join(tmpdir(), 'kiln-wal-'));
    const files = ['perf-lab.sqlite', 'perf-lab.sqlite-wal', 'perf-lab.sqlite-shm'];
    for (const f of files) copyFileSync(join(pl.dir, f), join(held, f));
    pl.db.close();
    for (const f of files) copyFileSync(join(held, f), join(pl.dir, f));
    rmSync(held, { recursive: true });
    const before = snapshot(pl.dir);
    expect(Object.keys(before)).toEqual(expect.arrayContaining(files));
    expect(refusedCount(imp())).toBe(0);
    expect(snapshot(pl.dir)).toEqual(before);
  });

  it('refuses what fails a check, stores none of it, imports the rest, and takes the rest once it is repaired', () => {
    const { pl, s, imp } = setup();
    const [m1993, m7088] = pl.media as [string, string];
    const archiveFile = join(pl.dir, 'evidence', `${pl.archiveSha}.tar.gz`);
    const flip = (file: string, at: number) => {
      const b = readFileSync(file);
      b[at] = (b[at]! ^ 0xff) & 0xff;
      writeFileSync(file, b);
    };
    flip(join(pl.dir, 'media', `${m7088}.jpg`), 5); // same size, other bytes
    writeFileSync(join(pl.dir, 'media', `${m1993}.jpg`), readFileSync(join(pl.dir, 'media', `${m1993}.jpg`)).subarray(0, 6)); // truncated
    flip(archiveFile, 20);
    pl.db.prepare(`update artifacts set spec_json = replace(spec_json, '"queries":64', '"queries":65') where hash = ?`).run(pl.candidate.hash);
    pl.db.prepare('update run_bundles set n_entities = 3 where hash = ? and rep = 1').run(pl.local.hash);
    pl.db.close();

    const sum = imp();
    const reasons = (k: keyof ImportSummary) => (sum[k] as { refused: { key: string; reason: string }[] }).refused.map((r) => [r.key, r.reason.replace(/[0-9a-f]{64}/g, '<sha>').replace(/[0-9a-f]{13,14}$/, '<hash>')]);
    expect(reasons('media')).toEqual([[m1993, 'the file has 6 bytes, Perf Lab recorded 11'], [m7088, 'checksum mismatch: the file hashes to <sha>']].sort((a, b) => a[0]!.localeCompare(b[0]!)));
    expect(reasons('archives')).toEqual([[pl.archiveSha, 'checksum mismatch: the file hashes to <sha>']]);
    expect(reasons('artifacts')).toEqual([[pl.candidate.hash, 'the spec hashes to <hash>']]);
    expect(reasons('runs')).toEqual([
      [`${pl.candidate.hash}#0`, 'its artifact was not imported'],
      [`${pl.candidate.hash}#1`, 'its artifact was not imported'],
      [`${pl.local.hash}#1`, 'the bundle holds 2 entities, Perf Lab recorded 3'],
    ].sort((a, b) => a[0]!.localeCompare(b[0]!)));
    expect(refusedCount(sum)).toBe(7);
    expect(counts(sum)).toMatchObject({ datasets: [1, 0, 0], artifacts: [2, 0, 1], runs: [1, 0, 3], jobs: [2, 0, 0] });
    // nothing refused is stored: no media rows or files, no archive, no artifact, no run
    expect(all(s.db, 'select sha256 from lab_media')).toEqual([]);
    expect(readdirSync(join(s.config.dataDir, 'lab', 'media'))).toEqual([]);
    expect(all(s.db, 'select sha256 from lab_evidence_archives')).toEqual([]);
    expect(get(s.db, 'select 1 as x from lab_artifacts where hash = ?', pl.candidate.hash)).toBeUndefined();
    expect(all(s.db, 'select hash, rep from lab_runs')).toEqual([{ hash: pl.local.hash, rep: 0 }]);

    // repaired at the source, the next run takes exactly what was refused
    const fresh = makePerfLabDir();
    fresh.db.close();
    const repaired = importPerfLab({ source: fresh.dir, db: s.db, dataDir: s.config.dataDir });
    expect(counts(repaired)).toEqual({ datasets: [0, 1, 0], archives: [1, 0, 0], media: [2, 0, 0], artifacts: [1, 2, 0], runs: [3, 1, 0], jobs: [0, 2, 0], programs: [0, 1, 0], annotations: [0, 1, 0] });
  });

  it('replaces a synthetic stand-in seeded here with Perf Lab\'s measured capture', async () => {
    const { pl, s, imp } = setup();
    pl.db.close();
    s.db.prepare(
      `insert into lab_artifacts (hash, lab_id, experiment, arm, mode, host, reps, spec_json, origin, status, created_at, imported_at, source)
       values (?, 'sampler', 'sampler-test', 'baseline', 'timing', 'local', 2, ?, 'synthetic', 'available', 'x', 'x', null)`,
    ).run(pl.local.hash, JSON.stringify(pl.local.spec));
    const sum = imp();
    expect(sum.artifacts).toMatchObject({ added: 3, present: 0 });
    expect(sum.notes).toContain(`artifact ${pl.local.hash}: the synthetic stand-in seeded here was replaced by Perf Lab's measured capture`);
    expect((await s.json('GET', '/api/lab/catalog')).body[pl.local.hash]).toMatchObject({ origin: 'measured', importedAt: '2026-10-12T01:00:00.000Z' });
  });

  it('refuses a missing source, an older Perf Lab schema, and a Kiln data directory inside the source', () => {
    const { pl, s } = setup();
    expect(() => importPerfLab({ source: tempDir(), db: s.db, dataDir: s.config.dataDir })).toThrow(/no Perf Lab database at/);
    expect(() => importPerfLab({ source: pl.dir, db: s.db, dataDir: join(pl.dir, 'kiln') })).toThrow(/is inside the Perf Lab data directory/);
    expect(() => importPerfLab({ source: pl.dir, db: s.db, dataDir: pl.dir })).toThrow(/is inside the Perf Lab data directory/);
    // the same directory reached through a symbolic link
    const link = join(tempDir(), 'pl-link');
    symlinkSync(pl.dir, link);
    expect(() => importPerfLab({ source: pl.dir, db: s.db, dataDir: join(link, 'kiln', 'data') })).toThrow(/is inside the Perf Lab data directory/);
    expect(() => importPerfLab({ source: link, db: s.db, dataDir: join(pl.dir, 'kiln') })).toThrow(/is inside the Perf Lab data directory/);
    pl.db.prepare('delete from schema_migrations where version = 5').run();
    pl.db.close();
    expect(() => importPerfLab({ source: pl.dir, db: s.db, dataDir: s.config.dataDir })).toThrow(/at schema 4; the importer reads schema 5/);
    expect(rows(s.db)).toEqual(Object.fromEntries(LAB_TABLES.map((t) => [t, 0])));
  });

  it('runs from the command line: prints the summary; exits 0, 1 when something is refused, 2 when the source is unreadable', () => {
    const pl = makePerfLabDir();
    pl.db.close();
    const kilnDir = tempDir();
    const cli = (...args: string[]) => spawnSync(process.execPath, ['src/lab/import.ts', ...args], { cwd: SERVER, env: { ...process.env, KILN_DATA_DIR: kilnDir }, encoding: 'utf8' });
    const first = cli(pl.dir);
    expect([first.status, first.stderr]).toEqual([0, '']);
    expect(first.stdout).toContain(`Perf Lab import: ${join(pl.dir, 'perf-lab.sqlite')} (schema 5, read-only)`);
    expect(first.stdout).toMatch(/ {2}artifacts +3 +0 +0\n/);
    expect(first.stdout).toContain('not imported (assistant transcripts are not lab data): conversations 1, messages 1, llm_calls 1');
    expect(cli(pl.dir).stdout).toMatch(/ {2}runs +0 +4 +0\n/);

    writeFileSync(join(pl.dir, 'media', `${pl.media[0]}.jpg`), 'x');
    const other = tempDir();
    const refused = spawnSync(process.execPath, ['src/lab/import.ts', pl.dir], { cwd: SERVER, env: { ...process.env, KILN_DATA_DIR: other }, encoding: 'utf8' });
    expect(refused.status).toBe(1);
    expect(refused.stdout).toContain(`REFUSED media ${pl.media[0]}: the file has 1 bytes, Perf Lab recorded 11`);

    const missing = cli(join(kilnDir, 'nope'));
    expect([missing.status, missing.stderr]).toEqual([2, `lab:import: no Perf Lab database at ${join(kilnDir, 'nope', 'perf-lab.sqlite')}\n`]);
    expect(cli('--help').stdout).toMatch(/^usage: pnpm --filter @kiln\/server lab:import \[perf-lab-data-dir\]/);
  });
});
