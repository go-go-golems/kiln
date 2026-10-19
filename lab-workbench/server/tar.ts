import { gunzipSync } from 'node:zlib';

/**
 * A minimal reader for gzip-compressed POSIX tar archives (ustar, pax and GNU long names), enough to validate
 * an evidence archive entry by entry before anything is written. Only regular files and directories are
 * accepted; links, devices and FIFOs are refused rather than skipped.
 */

export interface TarEntry {
  path: string;
  type: 'file' | 'dir';
  data: Uint8Array;
}

const BLOCK = 512;
const MAX_ENTRIES = 10_000;

const text = (b: Uint8Array, start: number, len: number) => {
  const slice = b.subarray(start, start + len);
  const end = slice.indexOf(0);
  return Buffer.from(end === -1 ? slice : slice.subarray(0, end)).toString('utf8');
};

const octal = (b: Uint8Array, start: number, len: number) => {
  const s = text(b, start, len).trim();
  return s ? parseInt(s, 8) : 0;
};

/** pax extended header records: "<len> key=value\n" */
function paxRecords(data: Uint8Array): Record<string, string> {
  const out: Record<string, string> = {};
  const s = Buffer.from(data).toString('utf8');
  let i = 0;
  while (i < s.length) {
    const sp = s.indexOf(' ', i);
    if (sp === -1) break;
    const len = Number(s.slice(i, sp));
    if (!Number.isFinite(len) || len <= 0) break;
    const rec = s.slice(sp + 1, i + len - 1);
    const eq = rec.indexOf('=');
    if (eq > 0) out[rec.slice(0, eq)] = rec.slice(eq + 1);
    i += len;
  }
  return out;
}

/** A path that stays inside the archive's directory: relative, no `..`, no NUL. */
export function checkPath(path: string): string {
  const p = path.replace(/^\.\//, '');
  if (!p || p.includes('\0')) throw new Error(`archive entry has an empty or invalid path`);
  if (p.startsWith('/') || /^[A-Za-z]:/.test(p) || p.startsWith('\\')) throw new Error(`archive entry ${p} has an absolute path`);
  if (p.split(/[\\/]/).includes('..')) throw new Error(`archive entry ${p} leaves the archive directory`);
  return p.replace(/\/+$/, '');
}

export function readTarGz(gz: Uint8Array, maxBytes = 512 * 2 ** 20): TarEntry[] {
  const b = gunzipSync(gz, { maxOutputLength: maxBytes });
  const entries: TarEntry[] = [];
  let off = 0;
  let pendingPath: string | null = null;
  while (off + BLOCK <= b.length) {
    const h = b.subarray(off, off + BLOCK);
    if (h.every((x) => x === 0)) break; // end-of-archive marker
    const sum = octal(h, 148, 8);
    let check = 0;
    for (let i = 0; i < BLOCK; i++) check += i >= 148 && i < 156 ? 32 : h[i];
    if (sum !== check) throw new Error(`tar header checksum mismatch at byte ${off}`);
    const size = octal(h, 124, 12);
    const typeflag = String.fromCharCode(h[156] || 0x30);
    const magic = text(h, 257, 6);
    const prefix = magic.startsWith('ustar') ? text(h, 345, 155) : '';
    const name = text(h, 0, 100);
    const dataStart = off + BLOCK;
    const data = b.subarray(dataStart, dataStart + size);
    if (data.length < size) throw new Error('truncated tar archive');
    off = dataStart + Math.ceil(size / BLOCK) * BLOCK;

    if (typeflag === 'x') {
      pendingPath = paxRecords(data).path ?? pendingPath;
      continue;
    }
    if (typeflag === 'g') continue; // global pax header: no per-entry meaning we use
    if (typeflag === 'L') {
      pendingPath = text(data, 0, data.length);
      continue;
    }
    const path = checkPath(pendingPath ?? (prefix ? `${prefix}/${name}` : name));
    pendingPath = null;
    if (typeflag === '0' || typeflag === '\0' || typeflag === '7') entries.push({ path, type: 'file', data: new Uint8Array(data) });
    else if (typeflag === '5') entries.push({ path, type: 'dir', data: new Uint8Array() });
    else throw new Error(`archive entry ${path} is not a regular file or directory (type ${typeflag})`);
    if (entries.length > MAX_ENTRIES) throw new Error(`archive has more than ${MAX_ENTRIES} entries`);
  }
  return entries;
}

/** Writes a ustar archive; used by tests to build fixtures, including hostile ones. */
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
  const total = blocks.reduce((a, x) => a + x.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const x of blocks) {
    out.set(x, o);
    o += x.length;
  }
  return out;
}
