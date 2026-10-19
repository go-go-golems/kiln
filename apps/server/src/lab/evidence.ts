// Evidence archives (PL/server/evidence.ts): .tar.gz files produced outside the lab (the PR 1005 DGX reproduction),
// identified by their SHA-256. Every entry is read and validated in memory before anything is written (tar.ts), so
// an archive can only create regular files and directories below its own directory; a COCO selection inside it is
// registered as a dataset in the same transaction as the archive row.
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { all, get, now, run, tx, type Db } from '../db.ts';
import { registerCocoDataset } from './datasets.ts';
import { archiveCopy, archiveRoot, sha256, writeFileAtomic } from './files.ts';
import { readTarGz } from './tar.ts';

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
  /** ids of the datasets registered from this archive */
  datasets: string[];
}

interface ArchiveRow {
  sha256: string;
  name: string;
  bytes: number;
  files_json: string;
  added_at: string;
}

const summaryOf = (db: Db, r: ArchiveRow): ArchiveSummary => ({
  sha256: r.sha256,
  name: r.name,
  bytes: r.bytes,
  files: JSON.parse(r.files_json) as ArchiveFile[],
  addedAt: r.added_at,
  datasets: all<{ id: string }>(db, 'select id from lab_datasets where source = ? order by id', `evidence:${r.sha256}`).map((d) => d.id),
});

export const listArchives = (db: Db): ArchiveSummary[] => all<ArchiveRow>(db, 'select * from lab_evidence_archives order by added_at, sha256').map((r) => summaryOf(db, r));

export function getArchive(db: Db, hash: string): ArchiveSummary | undefined {
  const r = get<ArchiveRow>(db, 'select * from lab_evidence_archives where sha256 = ?', hash);
  return r ? summaryOf(db, r) : undefined;
}

/** COCO selections inside an archive (the layout Playback's services/detection/GPU.md prescribes for /qualification). */
const COCO_SELECTIONS = [{ manifest: 'qualification/coco/instances_selected.json', provenance: 'qualification/coco/fixture-provenance.json' }];

/**
 * Registers an archive by content: refuses anything but a gzip-compressed tar of regular files and directories with
 * relative paths, at most MAX_ARCHIVE_BYTES; extracts it under lab/evidence/<sha256>/, keeps the archive itself, and
 * registers the COCO selection it contains. A known archive is returned as it is (`created: false`).
 */
export function registerArchive(db: Db, dataDir: string, data: Uint8Array, name: string, opts: { addedAt?: string } = {}): { archive: ArchiveSummary; created: boolean } {
  if (data.byteLength === 0 || data.byteLength > MAX_ARCHIVE_BYTES) throw new Error(`archive must be 1 byte to ${MAX_ARCHIVE_BYTES} bytes`);
  if (data[0] !== 0x1f || data[1] !== 0x8b) throw new Error('archive is not gzip-compressed');
  const hash = sha256(data);
  const existing = getArchive(db, hash);
  if (existing) return { archive: existing, created: false };

  const entries = readTarGz(data); // throws on links, absolute paths, `..`, bad checksums
  const files = entries.filter((e) => e.type === 'file');
  if (!files.length) throw new Error('archive holds no files');
  const byPath = new Map(files.map((f) => [f.path, f.data]));
  const root = archiveRoot(dataDir, hash);
  const copy = archiveCopy(dataDir, hash);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  try {
    for (const f of files) {
      const target = join(root, f.path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileAtomic(target, f.data);
    }
    writeFileAtomic(copy, data);
    const listed = files.map((f) => ({ path: f.path, bytes: f.data.byteLength })).sort((a, b) => a.path.localeCompare(b.path));
    const addedAt = opts.addedAt ?? now();
    tx(db, () => {
      for (const sel of COCO_SELECTIONS) {
        const m = byPath.get(sel.manifest);
        const p = byPath.get(sel.provenance);
        if (m && p) registerCocoDataset(db, m, JSON.parse(Buffer.from(p).toString('utf8')), { name: `${name} · COCO selection`, source: `evidence:${hash}`, addedAt });
      }
      run(db, 'insert into lab_evidence_archives (sha256, name, bytes, files_json, added_at) values (?, ?, ?, ?, ?)', hash, name, data.byteLength, JSON.stringify(listed), addedAt);
    });
    return { archive: getArchive(db, hash)!, created: true };
  } catch (e) {
    rmSync(root, { recursive: true, force: true });
    rmSync(copy, { force: true });
    throw e;
  }
}

/**
 * The bytes of an archive named by a local path (POST /evidence {path}). The page, holding the session token, may
 * register an archive that is too large for a JSON body; the path must be absolute and name a regular .tar.gz or
 * .tgz file within the size limit. The bytes then pass the same checks as an upload.
 */
export function readArchivePath(path: string): Uint8Array {
  if (!isAbsolute(path)) throw new Error('path must be absolute');
  if (!/\.(tar\.gz|tgz)$/.test(path)) throw new Error('path must name a .tar.gz or .tgz file');
  if (!existsSync(path)) throw new Error(`no file at ${path}`);
  const st = statSync(path);
  if (!st.isFile()) throw new Error(`${path} is not a regular file`);
  if (st.size === 0 || st.size > MAX_ARCHIVE_BYTES) throw new Error(`archive must be 1 byte to ${MAX_ARCHIVE_BYTES} bytes`);
  return readFileSync(path);
}
