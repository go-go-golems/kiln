import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { registerCocoDataset, sha256 } from './datasets';
import { all, get, now, run, type Db } from './db';
import { readTarGz } from './tar';

/**
 * Evidence archives: .tar.gz files produced outside the lab (e.g. the PR 1005 DGX reproduction), identified by
 * their SHA-256. Every entry is read and validated in memory before anything is written, so an archive can
 * only create regular files and directories below its own directory.
 */

export const MAX_ARCHIVE_BYTES = 64 * 2 ** 20;

export interface ArchiveFile {
  path: string;
  bytes: number;
}

export interface ArchiveSummary {
  sha256: string;
  name: string;
  bytes: number;
  files: ArchiveFile[];
  addedAt: string;
  datasets: string[];
}

interface ArchiveRow {
  sha256: string;
  name: string;
  bytes: number;
  files_json: string;
  added_at: string;
}

export const evidenceDir = (dataDir: string) => join(dataDir, 'evidence');
export const archiveRoot = (dataDir: string, hash: string) => join(evidenceDir(dataDir), hash);

const summaryOf = (db: Db, r: ArchiveRow): ArchiveSummary => ({
  sha256: r.sha256,
  name: r.name,
  bytes: r.bytes,
  files: JSON.parse(r.files_json) as ArchiveFile[],
  addedAt: r.added_at,
  datasets: all<{ id: string }>(db, 'select id from datasets where source = ?', `evidence:${r.sha256}`).map((d) => d.id),
});

export const listArchives = (db: Db) => all<ArchiveRow>(db, 'select * from evidence_archives order by added_at').map((r) => summaryOf(db, r));

export function getArchive(db: Db, hash: string): ArchiveSummary | undefined {
  const r = get<ArchiveRow>(db, 'select * from evidence_archives where sha256 = ?', hash);
  return r ? summaryOf(db, r) : undefined;
}

/** COCO selections inside an archive (the layout services/detection/GPU.md prescribes for /qualification). */
const COCO_SELECTIONS = [{ manifest: 'qualification/coco/instances_selected.json', provenance: 'qualification/coco/fixture-provenance.json' }];

export function registerArchive(db: Db, dataDir: string, data: Uint8Array, name: string): { archive: ArchiveSummary; created: boolean } {
  if (data.byteLength === 0 || data.byteLength > MAX_ARCHIVE_BYTES) throw new Error(`archive must be 1 byte to ${MAX_ARCHIVE_BYTES} bytes`);
  if (data[0] !== 0x1f || data[1] !== 0x8b) throw new Error('archive is not gzip-compressed');
  const hash = sha256(data);
  const existing = getArchive(db, hash);
  if (existing) return { archive: existing, created: false };

  const entries = readTarGz(data); // throws on links, absolute paths, `..`, bad checksums
  const files = entries.filter((e) => e.type === 'file');
  const byPath = new Map(files.map((f) => [f.path, f.data]));
  const root = archiveRoot(dataDir, hash);
  const copy = join(evidenceDir(dataDir), `${hash}.tar.gz`);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  try {
    for (const f of files) {
      const target = join(root, f.path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, f.data);
    }
    writeFileSync(copy, data);
    for (const sel of COCO_SELECTIONS) {
      const m = byPath.get(sel.manifest);
      const p = byPath.get(sel.provenance);
      if (m && p) registerCocoDataset(db, m, JSON.parse(Buffer.from(p).toString('utf8')), { name: `${name} · COCO selection`, source: `evidence:${hash}` });
    }
    const listed = files.map((f) => ({ path: f.path, bytes: f.data.byteLength })).sort((a, b) => a.path.localeCompare(b.path));
    run(db, 'insert into evidence_archives (sha256, name, bytes, files_json, added_at) values (?, ?, ?, ?, ?)', hash, name, data.byteLength, JSON.stringify(listed), now());
    return { archive: getArchive(db, hash)!, created: true };
  } catch (e) {
    rmSync(root, { recursive: true, force: true });
    rmSync(copy, { force: true });
    throw e;
  }
}

/** Reads a file of a registered archive; the path must be one the archive recorded. */
export function archiveFile(db: Db, dataDir: string, hash: string, path: string): Buffer | undefined {
  const a = getArchive(db, hash);
  if (!a || !a.files.some((f) => f.path === path)) return undefined;
  return readFileSync(join(archiveRoot(dataDir, hash), path));
}
