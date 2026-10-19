// Where the lab's files live (KILN_DATA_DIR/lab/…) and the content checks every file path depends on. Paths are only
// ever built from a validated lowercase SHA-256, never from a name a request supplied.
//
//   lab/evidence/<sha256>.tar.gz     an evidence archive as registered
//   lab/evidence/<sha256>/…          its entries, extracted after validation (tar.ts)
//   lab/media/<sha256>.jpg|.png      public images, named by the SHA-256 of their bytes
import { createHash } from 'node:crypto';
import { renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const SHA256_HEX = /^[0-9a-f]{64}$/;
export type Mime = 'image/jpeg' | 'image/png';

export const sha256 = (data: Uint8Array | string): string => createHash('sha256').update(data).digest('hex');

function checked(hash: string): string {
  if (!SHA256_HEX.test(hash)) throw new Error(`not a SHA-256: ${JSON.stringify(hash.slice(0, 80))}`);
  return hash;
}

export const labDir = (dataDir: string): string => join(dataDir, 'lab');
export const evidenceDir = (dataDir: string): string => join(labDir(dataDir), 'evidence');
export const archiveRoot = (dataDir: string, hash: string): string => join(evidenceDir(dataDir), checked(hash));
export const archiveCopy = (dataDir: string, hash: string): string => join(evidenceDir(dataDir), `${checked(hash)}.tar.gz`);
export const mediaDir = (dataDir: string): string => join(labDir(dataDir), 'media');
export const mediaFile = (dataDir: string, hash: string, mime: Mime): string => join(mediaDir(dataDir), `${checked(hash)}.${mime === 'image/png' ? 'png' : 'jpg'}`);

/** The image type by magic number: JPEG and PNG only. */
export const mimeOf = (data: Uint8Array): Mime | null =>
  data[0] === 0xff && data[1] === 0xd8 ? 'image/jpeg' : data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47 ? 'image/png' : null;

/** Writes a file whole or not at all: a temporary file in the same directory, then a rename. */
export function writeFileAtomic(file: string, data: Uint8Array): void {
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, data);
  renameSync(tmp, file);
}
